import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { memberTestIdentity, runAsMember } from "../../test-support/auth-context.js";
import { IssueAttachmentService } from "./issue-attachment.service.js";
import { IssueRectificationService, type UploadedFileLike } from "./issue-rectification.service.js";

interface FakeDatabaseOptions {
  failAudit?: boolean;
  recordCount?: number;
}

function createFakeDatabase(options: FakeDatabaseOptions = {}) {
  const issues = new Map([
    ["is-1", { id: "is-1", projectId: "quyang", title: "占道堆物", status: "pending" }],
    ["is-closed", { id: "is-closed", projectId: "quyang", title: "已闭环问题", status: "verified" }],
  ]);
  const records: Array<Record<string, any>> = [];
  const photos: Array<Record<string, any>> = [];
  const audits: Array<Record<string, any>> = [];
  const issueLookups: Array<Record<string, unknown>> = [];
  const recordQueries: Array<Record<string, unknown>> = [];

  const database: any = {
    issue: {
      findUnique: async ({ where }: { where: { id: string; projectId: string } }) => {
        issueLookups.push(where);
        const issue = issues.get(where.id);
        return issue?.projectId === where.projectId ? issue : null;
      },
    },
    issueRectificationRecord: {
      findMany: async (query: Record<string, unknown>) => {
        recordQueries.push(query);
        return records
          .filter((record) => record.issueId === (query.where as { issueId: string }).issueId)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map((record) => ({ ...record, photos: photos.filter((photo) => photo.rectificationRecordId === record.id) }));
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        const created = { ...data, createdAt: new Date("2026-07-14T03:00:00.000Z") };
        records.push(created);
        return created;
      },
      count: async () => options.recordCount ?? records.length,
    },
    issueAttachment: {
      create: async ({ data }: { data: Record<string, any> }) => {
        const created = { ...data, createdAt: new Date("2026-07-14T03:00:00.000Z") };
        photos.push(created);
        return created;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, any> }) => {
        if (options.failAudit) throw new Error("audit unavailable");
        audits.push(data);
        return data;
      },
    },
  };
  database.$transaction = async (callback: (transaction: typeof database) => Promise<unknown>) => {
    const recordLength = records.length;
    const photoLength = photos.length;
    const auditLength = audits.length;
    try {
      return await callback(database);
    } catch (error) {
      records.length = recordLength;
      photos.length = photoLength;
      audits.length = auditLength;
      throw error;
    }
  };

  return { database, records, photos, audits, issueLookups, recordQueries };
}

async function createImageFile(storageRoot: string, name = "rectification.jpg"): Promise<UploadedFileLike> {
  const path = join(storageRoot, `temp-${name}`);
  await writeFile(path, "image");
  return { filename: name, originalname: name, mimetype: "image/jpeg", path, size: 5 };
}

test("validates rectification input and closed issue state before storing files", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-rectification-validation-"));
  const { database } = createFakeDatabase();
  const service = new IssueRectificationService(database, storageRoot);
  const imageFile = await createImageFile(storageRoot);

  await assert.rejects(
    () => runAsMember(() => service.create("is-1", [], { description: "已完成整改" })),
    /至少上传 1 张整改照片/,
  );
  await assert.rejects(
    () => runAsMember(() => service.create("is-1", [imageFile], { description: "  " })),
    /请填写整改说明/,
  );
  await assert.rejects(
    () => runAsMember(() => service.create("is-closed", [imageFile], { description: "已完成整改" })),
    /问题已闭环/,
  );
  await assert.rejects(
    () => runAsMember(() => service.create("is-1", Array(7).fill(imageFile), { description: "已完成整改" })),
    /一次最多上传 6 张整改照片/,
  );
  const invalidFile = await createImageFile(storageRoot, "rectification.gif");
  await assert.rejects(
    () => runAsMember(() => service.create("is-1", [invalidFile], { description: "已完成整改" })),
    /仅支持 PNG、JPG、JPEG 和 WEBP 格式/,
  );
});

test("creates a rectification record, linked photos, and audit atomically", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-rectification-create-"));
  const { database, records, photos, audits } = createFakeDatabase();
  const service = new IssueRectificationService(database, storageRoot);
  const imageFile = await createImageFile(storageRoot);

  const createdRecord = await runAsMember(() => service.create("is-1", [imageFile], { description: "  已完成整改  " }));

  assert.equal(createdRecord.description, "已完成整改");
  assert.equal(createdRecord.createdBy, memberTestIdentity.username);
  assert.equal(createdRecord.photos.length, 1);
  assert.match(createdRecord.photos[0].imageUrl, /^\/issues\/rectifications\/photos\/.+\/file$/);
  assert.equal(records.length, 1);
  assert.equal(photos[0].attachmentType, "整改照片");
  assert.equal(photos[0].rectificationRecordId, createdRecord.id);
  assert.equal(audits[0].action, "issue.rectification.create");
});

test("removes every moved photo when the transaction fails", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-rectification-rollback-"));
  const { database, records, photos } = createFakeDatabase({ failAudit: true });
  const service = new IssueRectificationService(database, storageRoot);
  const files = [await createImageFile(storageRoot, "one.png"), await createImageFile(storageRoot, "two.webp")];

  await assert.rejects(
    () => runAsMember(() => service.create("is-1", files, { description: "整改完成" })),
    /audit unavailable/,
  );

  assert.equal(records.length, 0);
  assert.equal(photos.length, 0);
  assert.deepEqual(await readdir(join(storageRoot, "storage/issues")), []);
});

test("lists newest rectification records inside the current project", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-rectification-list-"));
  const { database, records, photos, issueLookups, recordQueries } = createFakeDatabase();
  records.push(
    { id: "rr-old", issueId: "is-1", description: "旧整改", createdBy: "member", createdAt: new Date("2026-07-13T03:00:00.000Z") },
    { id: "rr-new", issueId: "is-1", description: "新整改", createdBy: "member", createdAt: new Date("2026-07-14T03:00:00.000Z") },
  );
  photos.push({
    id: "ia-photo", issueId: "is-1", rectificationRecordId: "rr-new", originalFileName: "photo.jpg",
    mimeType: "image/jpeg", fileSize: 5, createdAt: new Date("2026-07-14T03:00:00.000Z"),
  });
  const service = new IssueRectificationService(database, storageRoot);

  const result = await runAsMember(() => service.list("is-1"));

  assert.deepEqual(issueLookups[0], { id: "is-1", projectId: "quyang" });
  assert.deepEqual(recordQueries[0], {
    where: { issueId: "is-1" },
    orderBy: { createdAt: "desc" },
    include: { photos: { orderBy: { createdAt: "asc" } } },
  });
  assert.deepEqual(result.map((record) => record.id), ["rr-new", "rr-old"]);
  assert.equal(result[0].photos[0].imageUrl, "/issues/rectifications/photos/ia-photo/file");
});

test("keeps rectification photos out of the original attachment list", async () => {
  let attachmentQuery: Record<string, unknown> | undefined;
  const database = {
    issue: { findUnique: async () => ({ id: "is-1" }) },
    issueAttachment: {
      findMany: async (query: Record<string, unknown>) => {
        attachmentQuery = query;
        return [];
      },
    },
  };
  const service = new IssueAttachmentService(database as never, {} as never);

  await runAsMember(() => service.list("is-1"));

  assert.deepEqual(attachmentQuery, {
    where: { issueId: "is-1", rectificationRecordId: null },
    orderBy: { createdAt: "desc" },
  });
});
