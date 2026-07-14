import assert from "node:assert/strict";
import { access, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { memberTestIdentity, runAsMember } from "../../test-support/auth-context.js";
import { IssueAttachmentService } from "./issue-attachment.service.js";
import { IssueRectificationService, type UploadedFileLike } from "./issue-rectification.service.js";

interface FakeDatabaseOptions {
  failAudit?: boolean;
  recordCount?: number;
  throwAfterCommit?: boolean;
}

function createFakeDatabase(options: FakeDatabaseOptions = {}) {
  const issues = new Map([
    ["is-1", { id: "is-1", projectId: "quyang", title: "占道堆物", status: "pending" }],
    ["is-closed", { id: "is-closed", projectId: "quyang", title: "已闭环问题", status: "verified" }],
    ["is-ignored", { id: "is-ignored", projectId: "quyang", title: "已忽略问题", status: "ignored" }],
    ["is-archived", { id: "is-archived", projectId: "quyang", title: "已归档问题", status: "archived" }],
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
      findUnique: async ({ where }: { where: { id: string } }) => {
        const record = records.find((item) => item.id === where.id);
        return record ? { ...record, photos: photos.filter((photo) => photo.rectificationRecordId === record.id) } : null;
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
    $queryRaw: async () => {
      const issue = issues.get("is-1");
      return issue ? [{ id: issue.id, title: issue.title, status: issue.status }] : [];
    },
  };
  database.$transaction = async (callback: (transaction: typeof database) => Promise<unknown>) => {
    const recordLength = records.length;
    const photoLength = photos.length;
    const auditLength = audits.length;
    let result: unknown;
    try {
      result = await callback(database);
    } catch (error) {
      records.length = recordLength;
      photos.length = photoLength;
      audits.length = auditLength;
      throw error;
    }
    if (options.throwAfterCommit) throw new Error("connection lost after commit");
    return result;
  };

  return { database, records, photos, audits, issueLookups, recordQueries };
}

async function createImageFile(storageRoot: string, name = "rectification.jpg", actualFormat?: "jpeg" | "png" | "webp" | "gif"): Promise<UploadedFileLike> {
  const path = join(storageRoot, `temp-${name}`);
  const extension = name.split(".").pop()?.toLowerCase();
  const format = actualFormat ?? (extension === "jpg" ? "jpeg" : extension === "png" || extension === "webp" || extension === "gif" ? extension : "jpeg");
  const buffer = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#2d6cdf" },
  }).toFormat(format).toBuffer();
  await writeFile(path, buffer);
  return { filename: name, originalname: name, mimetype: "application/octet-stream", path, size: buffer.length };
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
  const closedFile = await createImageFile(storageRoot, "closed.jpg");
  await assert.rejects(
    () => runAsMember(() => service.create("is-closed", [closedFile], { description: "已完成整改" })),
    /问题已闭环/,
  );
  const tooManyFile = await createImageFile(storageRoot, "too-many.jpg");
  await assert.rejects(
    () => runAsMember(() => service.create("is-1", Array(7).fill(tooManyFile), { description: "已完成整改" })),
    /一次最多上传 6 张整改照片/,
  );
  const invalidFile = await createImageFile(storageRoot, "rectification.gif");
  await assert.rejects(
    () => runAsMember(() => service.create("is-1", [invalidFile], { description: "已完成整改" })),
    /仅支持 JPEG、PNG 和 WebP 图片/,
  );
});

test("rejects new rectification records for every read-only issue status", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-rectification-terminal-"));
  const { database } = createFakeDatabase();
  const service = new IssueRectificationService(database, storageRoot);

  for (const issueId of ["is-ignored", "is-archived"]) {
    const file = await createImageFile(storageRoot, `${issueId}.jpg`);
    await assert.rejects(
      () => runAsMember(() => service.create(issueId, [file], { description: "整改完成" })),
      /当前状态不能提交整改记录或确认闭环/,
    );
  }
});

test("rejects a non-image disguised as jpg and removes its temporary file", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-rectification-fake-image-"));
  const path = join(storageRoot, "fake.jpg");
  await writeFile(path, "this is not an image");
  const file: UploadedFileLike = {
    filename: "fake.jpg",
    originalname: "fake.jpg",
    mimetype: "image/jpeg",
    path,
    size: 20,
  };
  const { database } = createFakeDatabase();
  const service = new IssueRectificationService(database, storageRoot);

  await assert.rejects(
    () => runAsMember(() => service.create("is-1", [file], { description: "整改完成" })),
    /无法识别|仅支持 JPEG、PNG 和 WebP/,
  );
  await assert.rejects(() => access(path));
});

test("removes uploaded temporary files when identity resolution fails", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-rectification-identity-cleanup-"));
  const imageFile = await createImageFile(storageRoot);
  const { database } = createFakeDatabase();
  const service = new IssueRectificationService(database, storageRoot);

  await assert.rejects(() => service.create("is-1", [imageFile], { description: "整改完成" }), /Authenticated identity/i);
  await assert.rejects(() => access(imageFile.path));
});

test("removes uploaded temporary files when final directory creation fails", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-rectification-mkdir-cleanup-"));
  await writeFile(join(storageRoot, "storage"), "blocks directory creation");
  const imageFile = await createImageFile(storageRoot);
  const { database } = createFakeDatabase();
  const service = new IssueRectificationService(database, storageRoot);

  await assert.rejects(
    () => runAsMember(() => service.create("is-1", [imageFile], { description: "整改完成" })),
    /ENOTDIR|EEXIST/,
  );
  await assert.rejects(() => access(imageFile.path));
});

test("derives stored extension and mime type from actual image content", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-rectification-detected-format-"));
  const { database, photos } = createFakeDatabase();
  const service = new IssueRectificationService(database, storageRoot);
  const imageFile = await createImageFile(storageRoot, "misleading.jpg", "png");

  const created = await runAsMember(() => service.create("is-1", [imageFile], { description: "整改完成" }));

  assert.equal(created.photos[0].mimeType, "image/png");
  assert.match(photos[0].fileName, /\.png$/);
  assert.equal(photos[0].mimeType, "image/png");
  assert.match(photos[0].storagePath, /\.png$/);
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
  assert.match(createdRecord.photos[0].thumbnailUrl, /^\/issues\/rectifications\/photos\/.+\/thumbnail$/);
  assert.equal(records.length, 1);
  assert.equal(photos[0].attachmentType, "整改照片");
  assert.equal(photos[0].rectificationRecordId, createdRecord.id);
  assert.equal(audits[0].action, "issue.rectification.create");
});

test("renders a bounded JPEG thumbnail without replacing the original photo", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-rectification-thumbnail-"));
  const originalPath = join(storageRoot, "wide.png");
  await sharp({
    create: { width: 1600, height: 900, channels: 3, background: "#2d6cdf" },
  }).png().toFile(originalPath);
  const database = {
    issueAttachment: {
      findFirst: async () => ({
        storagePath: originalPath,
        originalFileName: "wide.png",
        fileName: "wide.png",
        mimeType: "image/png",
      }),
    },
  };
  const service = new IssueRectificationService(database as never, storageRoot);

  const thumbnail = await runAsMember(() => service.thumbnail("ia-photo"));
  const metadata = await sharp(thumbnail).metadata();

  assert.equal(metadata.format, "jpeg");
  assert.ok((metadata.width ?? 0) <= 480);
  assert.ok((metadata.height ?? 0) <= 360);
  assert.equal((await sharp(originalPath).metadata()).format, "png");
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

test("preserves referenced photos when a committed transaction reports an error", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-rectification-uncertain-commit-"));
  const { database, records, photos } = createFakeDatabase({ throwAfterCommit: true });
  const service = new IssueRectificationService(database, storageRoot);
  const imageFile = await createImageFile(storageRoot);

  const result = await runAsMember(() => service.create("is-1", [imageFile], { description: "整改完成" }));

  assert.equal(records.length, 1);
  assert.equal(result.id, records[0].id);
  assert.equal(photos.length, 1);
  await access(photos[0].storagePath);
});

test("rechecks the locked issue state inside the transaction when closure wins the race", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-rectification-race-"));
  const imageFile = await createImageFile(storageRoot);
  let recordCreateCalls = 0;
  const database: any = {
    issue: {
      findUnique: async () => ({ id: "is-1", projectId: "quyang", title: "占道堆物", status: "pending" }),
    },
    issueRectificationRecord: {
      findUnique: async () => null,
    },
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => callback({
      $queryRaw: async () => [{ id: "is-1", title: "占道堆物", status: "verified" }],
      issueRectificationRecord: {
        create: async () => {
          recordCreateCalls += 1;
          throw new Error("record should not be created");
        },
      },
    }),
  };
  const service = new IssueRectificationService(database, storageRoot);

  await assert.rejects(
    () => runAsMember(() => service.create("is-1", [imageFile], { description: "整改完成" })),
    /问题已闭环/,
  );

  assert.equal(recordCreateCalls, 0);
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
