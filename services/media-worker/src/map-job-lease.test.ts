import assert from "node:assert/strict";
import test from "node:test";
import { MapJobLeaseCoordinator } from "./map-job-lease.js";

interface LeaseRow {
  id: string;
  ownerId: string | null;
  expiresAt: Date;
  heartbeatAt: Date;
}

interface JobRow {
  id: string;
  status: string;
  jobType: string;
  attemptId: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
  inputJson: string;
  projectId: string;
}

function createLeaseDatabase(now: () => Date) {
  let lease: LeaseRow | null = null;
  const jobs: JobRow[] = [];
  const database = {
    jobs,
    lease: () => lease,
    mapWorkerLease: {
      upsert: async ({ create }: { create: LeaseRow }) => {
        lease ??= { ...create };
        return lease;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!lease || lease.id !== where.id) return { count: 0 };
        const alternatives = (where.OR as Array<Record<string, unknown>> | undefined) ?? [];
        const ownerMatches = where.ownerId === undefined || lease.ownerId === where.ownerId;
        const alternativeMatches = alternatives.length === 0 || alternatives.some((alternative) => (
          alternative.ownerId === lease!.ownerId
          || ((alternative.expiresAt as { lte?: Date } | undefined)?.lte !== undefined
            && lease!.expiresAt <= (alternative.expiresAt as { lte: Date }).lte)
        ));
        if (!ownerMatches || !alternativeMatches) return { count: 0 };
        lease = { ...lease, ...data, updatedAt: now() } as LeaseRow;
        return { count: 1 };
      },
    },
    mediaProcessingJob: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const job = jobs.find((candidate) => candidate.id === where.id);
        const statusFilter = where.status as string | { in?: string[] } | undefined;
        const statusMatches = statusFilter === undefined
          || (typeof statusFilter === "string" ? job?.status === statusFilter : statusFilter.in?.includes(job?.status ?? "") === true);
        if (
          !job
          || !statusMatches
          || job.attemptId !== where.attemptId
          || job.leaseOwner !== where.leaseOwner
        ) {
          return { count: 0 };
        }
        Object.assign(job, data);
        return { count: 1 };
      },
      findMany: async () => jobs.filter((job) => (
        job.status === "running"
        && new Set(["tiff_tile", "map_tile_package"]).has(job.jobType)
        && job.leaseExpiresAt !== null
        && job.leaseExpiresAt <= now()
      )),
    },
  };
  return database;
}

test("two independent coordinators allow only one database-global map lease owner", async () => {
  let timestamp = new Date("2026-07-14T00:00:00.000Z");
  const now = () => new Date(timestamp);
  const database = createLeaseDatabase(now);
  const first = new MapJobLeaseCoordinator(database as never, { ownerId: "runner-a", leaseDurationMs: 30_000, now });
  const second = new MapJobLeaseCoordinator(database as never, { ownerId: "runner-b", leaseDurationMs: 30_000, now });

  assert.equal(await first.acquireGlobal(), true);
  assert.equal(await second.acquireGlobal(), false);
  assert.equal(database.lease()?.ownerId, "runner-a");

  await first.releaseGlobal();
  assert.equal(await second.acquireGlobal(), true);
  assert.equal(database.lease()?.ownerId, "runner-b");

  timestamp = new Date("2026-07-14T00:01:00.000Z");
  assert.equal(await first.acquireGlobal(), true);
  assert.equal(database.lease()?.ownerId, "runner-a");
});

test("heartbeat renews both global and job leases and release relinquishes ownership", async () => {
  let timestamp = new Date("2026-07-14T00:00:00.000Z");
  const now = () => new Date(timestamp);
  const database = createLeaseDatabase(now);
  database.jobs.push({
    id: "job-map-1",
    status: "running",
    jobType: "map_tile_package",
    attemptId: "attempt-1",
    leaseOwner: "runner-a",
    leaseExpiresAt: new Date("2026-07-14T00:00:30.000Z"),
    heartbeatAt: timestamp,
    inputJson: "{}",
    projectId: "quyang",
  });
  const coordinator = new MapJobLeaseCoordinator(database as never, {
    ownerId: "runner-a",
    leaseDurationMs: 30_000,
    now,
  });
  assert.equal(await coordinator.acquireGlobal(), true);

  timestamp = new Date("2026-07-14T00:00:10.000Z");
  await coordinator.heartbeat("job-map-1", "attempt-1");

  assert.equal(database.lease()?.expiresAt.toISOString(), "2026-07-14T00:00:40.000Z");
  assert.equal(database.jobs[0].leaseExpiresAt?.toISOString(), "2026-07-14T00:00:40.000Z");
  assert.equal(database.jobs[0].heartbeatAt?.toISOString(), "2026-07-14T00:00:10.000Z");

  database.jobs[0].status = "completed";
  await coordinator.releaseJob("job-map-1", "attempt-1");
  assert.equal(database.jobs[0].leaseOwner, null);
  assert.equal(database.jobs[0].attemptId, null);
  assert.equal(database.lease()?.ownerId, null);
});

test("release preserves an expired running attempt so crash recovery can requeue it", async () => {
  const now = () => new Date("2026-07-14T00:01:00.000Z");
  const database = createLeaseDatabase(now);
  database.jobs.push({
    id: "job-lost-lease",
    status: "running",
    jobType: "map_tile_package",
    attemptId: "attempt-lost",
    leaseOwner: "runner-a",
    leaseExpiresAt: new Date("2026-07-14T00:00:30.000Z"),
    heartbeatAt: new Date("2026-07-14T00:00:00.000Z"),
    inputJson: JSON.stringify({ mapAssetId: "map-lost-lease" }),
    projectId: "jinshan",
  });
  const coordinator = new MapJobLeaseCoordinator(database as never, { ownerId: "runner-a", now });

  await coordinator.releaseJob("job-lost-lease", "attempt-lost");

  assert.equal(database.jobs[0].attemptId, "attempt-lost");
  assert.equal(database.jobs[0].leaseOwner, "runner-a");
  assert.deepEqual((await coordinator.expiredMapJobs()).map((job) => job.id), ["job-lost-lease"]);
});

test("only expired running map attempts are returned for crash recovery", async () => {
  const now = () => new Date("2026-07-14T00:01:00.000Z");
  const database = createLeaseDatabase(now);
  database.jobs.push(
    {
      id: "expired-map",
      status: "running",
      jobType: "map_tile_package",
      attemptId: "old-attempt",
      leaseOwner: "dead-runner",
      leaseExpiresAt: new Date("2026-07-14T00:00:00.000Z"),
      heartbeatAt: new Date("2026-07-14T00:00:00.000Z"),
      inputJson: JSON.stringify({ mapAssetId: "map-expired" }),
      projectId: "quyang",
    },
    {
      id: "live-map",
      status: "running",
      jobType: "tiff_tile",
      attemptId: "live-attempt",
      leaseOwner: "live-runner",
      leaseExpiresAt: new Date("2026-07-14T00:02:00.000Z"),
      heartbeatAt: new Date("2026-07-14T00:00:55.000Z"),
      inputJson: JSON.stringify({ mapAssetId: "map-live" }),
      projectId: "quyang",
    },
  );
  const coordinator = new MapJobLeaseCoordinator(database as never, { ownerId: "recovery-runner", now });

  assert.deepEqual((await coordinator.expiredMapJobs()).map((job) => job.id), ["expired-map"]);
});

test("global heartbeat renews only the current owner and rejects a stale recovery runner", async () => {
  let timestamp = new Date("2026-07-14T00:00:00.000Z");
  const now = () => new Date(timestamp);
  const database = createLeaseDatabase(now);
  const owner = new MapJobLeaseCoordinator(database as never, { ownerId: "runner-a", leaseDurationMs: 30_000, now });
  const stale = new MapJobLeaseCoordinator(database as never, { ownerId: "runner-b", leaseDurationMs: 30_000, now });
  assert.equal(await owner.acquireGlobal(), true);

  timestamp = new Date("2026-07-14T00:00:10.000Z");
  await owner.heartbeatGlobal();
  assert.equal(database.lease()?.expiresAt.toISOString(), "2026-07-14T00:00:40.000Z");
  await assert.rejects(() => stale.heartbeatGlobal(), /全局租约已丢失/);
});
