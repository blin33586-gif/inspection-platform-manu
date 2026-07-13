import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const GLOBAL_MAP_LEASE_ID = "global-map-processing";
const MAP_JOB_TYPES = ["tiff_tile", "map_tile_package"];

export interface ExpiredMapJob {
  id: string;
  projectId: string;
  inputJson: string;
  attemptId: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
}

interface MapJobLeaseOptions {
  ownerId?: string;
  leaseDurationMs?: number;
  now?: () => Date;
}

export class MapJobLeaseCoordinator {
  readonly ownerId: string;
  readonly leaseDurationMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly database: PrismaClient,
    options: MapJobLeaseOptions = {},
  ) {
    this.ownerId = options.ownerId ?? `map-runner-${randomUUID()}`;
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
    this.now = options.now ?? (() => new Date());
  }

  newAttemptId() {
    return randomUUID();
  }

  leaseFields(attemptId: string) {
    const now = this.now();
    return {
      leaseOwner: this.ownerId,
      attemptId,
      leaseExpiresAt: this.deadline(now),
      heartbeatAt: now,
    };
  }

  async acquireGlobal() {
    const now = this.now();
    const expiresAt = this.deadline(now);
    await this.database.mapWorkerLease.upsert({
      where: { id: GLOBAL_MAP_LEASE_ID },
      create: {
        id: GLOBAL_MAP_LEASE_ID,
        ownerId: this.ownerId,
        expiresAt,
        heartbeatAt: now,
      },
      update: {},
    });
    const claim = await this.database.mapWorkerLease.updateMany({
      where: {
        id: GLOBAL_MAP_LEASE_ID,
        OR: [
          { ownerId: this.ownerId },
          { expiresAt: { lte: now } },
        ],
      },
      data: { ownerId: this.ownerId, expiresAt, heartbeatAt: now },
    });
    return claim.count === 1;
  }

  async heartbeat(jobId: string, attemptId: string) {
    const now = this.now();
    const expiresAt = this.deadline(now);
    const global = await this.database.mapWorkerLease.updateMany({
      where: { id: GLOBAL_MAP_LEASE_ID, ownerId: this.ownerId },
      data: { expiresAt, heartbeatAt: now },
    });
    if (global.count !== 1) throw new Error("地图处理全局租约已丢失");

    const job = await this.database.mediaProcessingJob.updateMany({
      where: {
        id: jobId,
        status: "running",
        leaseOwner: this.ownerId,
        attemptId,
      },
      data: { leaseExpiresAt: expiresAt, heartbeatAt: now },
    });
    if (job.count !== 1) throw new Error("地图处理任务租约已丢失");
  }

  async expiredMapJobs(): Promise<ExpiredMapJob[]> {
    return this.database.mediaProcessingJob.findMany({
      where: {
        jobType: { in: MAP_JOB_TYPES },
        status: "running",
        leaseExpiresAt: { lte: this.now() },
        attemptId: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        projectId: true,
        inputJson: true,
        attemptId: true,
        leaseOwner: true,
        leaseExpiresAt: true,
      },
    });
  }

  async requeueExpiredJob(job: ExpiredMapJob) {
    return this.database.mediaProcessingJob.updateMany({
      where: {
        id: job.id,
        status: "running",
        attemptId: job.attemptId,
        leaseOwner: job.leaseOwner,
        leaseExpiresAt: job.leaseExpiresAt,
      },
      data: {
        status: "queued",
        startedAt: null,
        leaseOwner: null,
        attemptId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        errorMessage: null,
      },
    });
  }

  async releaseJob(jobId: string, attemptId: string) {
    await this.database.mediaProcessingJob.updateMany({
      where: { id: jobId, leaseOwner: this.ownerId, attemptId },
      data: { leaseOwner: null, attemptId: null, leaseExpiresAt: null, heartbeatAt: null },
    });
    await this.releaseGlobal();
  }

  async releaseGlobal() {
    const now = this.now();
    await this.database.mapWorkerLease.updateMany({
      where: { id: GLOBAL_MAP_LEASE_ID, ownerId: this.ownerId },
      data: { ownerId: null, expiresAt: now, heartbeatAt: now },
    });
  }

  private deadline(now: Date) {
    return new Date(now.getTime() + this.leaseDurationMs);
  }
}
