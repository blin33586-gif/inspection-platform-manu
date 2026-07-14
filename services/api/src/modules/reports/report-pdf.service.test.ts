import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { runAsMember } from "../../test-support/auth-context.js";
import {
  createConcurrencyGate,
  REPORT_PDF_EXPORT_CONCURRENCY,
  REPORT_PDF_MAX_INPUT_BYTES,
  REPORT_PDF_MAX_PIXELS,
  REPORT_PDF_MAX_PHOTOS,
  REPORT_PDF_MAX_SINGLE_IMAGE_BYTES,
  REPORT_PDF_PREVIEW_MAX_EDGE,
  ReportPdfService,
  resolveReportStoragePath,
} from "./report-pdf.service.js";

test("uses lower per-image, cumulative byte, and pixel budgets", () => {
  assert.equal(REPORT_PDF_MAX_SINGLE_IMAGE_BYTES, 10 * 1024 * 1024);
  assert.equal(REPORT_PDF_MAX_INPUT_BYTES, 50 * 1024 * 1024);
  assert.equal(REPORT_PDF_MAX_PIXELS, 20_000_000);
  assert.equal(REPORT_PDF_PREVIEW_MAX_EDGE, 2000);
  assert.equal(REPORT_PDF_EXPORT_CONCURRENCY, 1);
});

test("only resolves database paths inside the storage root", () => {
  const cwd = resolve("/srv/xunjianbao");

  assert.equal(
    resolveReportStoragePath("storage/media/photo.jpg", cwd),
    resolve(cwd, "storage/media/photo.jpg"),
  );
  assert.throws(() => resolveReportStoragePath("/tmp/photo.jpg", cwd), /存储路径无效/);
  assert.throws(() => resolveReportStoragePath("storage/../../etc/passwd", cwd), /存储路径无效/);
  assert.throws(() => resolveReportStoragePath("media/photo.jpg", cwd), /存储路径无效/);
});

test("rejects a storage symlink whose real path escapes the storage root", async () => {
  const storageRoot = join(process.cwd(), "storage");
  await mkdir(storageRoot, { recursive: true });
  const storageDirectory = await mkdtemp(join(storageRoot, "report-pdf-link-"));
  const outsideDirectory = await mkdtemp(join(tmpdir(), "report-pdf-outside-"));
  const outsidePhoto = join(outsideDirectory, "outside.png");
  const linkedPhoto = join(storageDirectory, "linked.png");
  await writeFile(outsidePhoto, await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer());
  await symlink(outsidePhoto, linkedPhoto);
  const report = reportRecord(1);
  report.photos[0].taskPhoto.mediaAsset.storagePath = linkedPhoto.slice(process.cwd().length + 1);
  report.photos[0].taskPhoto.mediaAsset.mimeType = "image/png";
  const database = { inspectionReport: { findUnique: async () => report } };
  const service = new ReportPdfService(database as never, pdfBrowserLauncher() as never);

  try {
    await assert.rejects(runAsMember(() => service.create("rp-1")), /真实路径不在 storage 目录内/);
  } finally {
    await rm(storageDirectory, { recursive: true, force: true });
    await rm(outsideDirectory, { recursive: true, force: true });
  }
});

function reportRecord(photoCount = 0) {
  return {
    id: "rp-1",
    title: "综合巡检报告",
    reportDate: new Date("2026-07-08T00:00:00.000Z"),
    relatedObjectName: "曲阳路街道重点区域",
    issueCount: photoCount,
    contentSummary: "巡检完成",
    photos: Array.from({ length: photoCount }, (_, index) => ({
      taskPhoto: {
        id: `photo-${index}`,
        videoTimestampMs: null,
        latitude: null,
        longitude: null,
        mediaAsset: {
          originalFileName: `photo-${index}.jpg`,
          storagePath: `storage/reports/photo-${index}.jpg`,
          mimeType: "image/jpeg",
          previewStoragePath: null,
          previewMimeType: null,
        },
        annotationDocument: null,
        sourceIssues: [],
      },
    })),
  };
}

function pdfBrowserLauncher(onLaunch: () => void = () => {}) {
  return {
    launch: async () => {
      onLaunch();
      return {
        newPage: async () => ({
          setContent: async () => {},
          pdf: async () => Uint8Array.from([37, 80, 68, 70]),
        }),
        close: async () => {},
      };
    },
  };
}

test("rejects a report that exceeds the photo page limit before reading images", async () => {
  let readCount = 0;
  const database = { inspectionReport: { findUnique: async () => reportRecord(REPORT_PDF_MAX_PHOTOS + 1) } };
  const fileReader = {
    realpath: async (path: string) => path,
    stat: async () => ({ size: 1 }),
    readFile: async () => { readCount += 1; return Buffer.from("image"); },
  };
  const service = new ReportPdfService(database as never, pdfBrowserLauncher() as never, undefined, fileReader as never);

  await assert.rejects(runAsMember(() => service.create("rp-1")), /报告照片不能超过/);
  assert.equal(readCount, 0);
});

test("rejects cumulative source image bytes above the report limit", async () => {
  const database = { inspectionReport: { findUnique: async () => reportRecord(6) } };
  const fileReader = {
    realpath: async (path: string) => path,
    stat: async () => ({ size: 9 * 1024 * 1024 }),
    readFile: async () => Buffer.from("image"),
  };
  const service = new ReportPdfService(database as never, pdfBrowserLauncher() as never, undefined, fileReader as never);

  await assert.rejects(runAsMember(() => service.create("rp-1")), /照片文件总大小不能超过/);
});

test("rejects one source image above the per-image byte limit before reading", async () => {
  let readCount = 0;
  const database = { inspectionReport: { findUnique: async () => reportRecord(1) } };
  const fileReader = {
    realpath: async (path: string) => path,
    stat: async () => ({ size: REPORT_PDF_MAX_SINGLE_IMAGE_BYTES + 1 }),
    readFile: async () => { readCount += 1; return Buffer.from("image"); },
  };
  const service = new ReportPdfService(database as never, pdfBrowserLauncher() as never, undefined, fileReader as never);

  await assert.rejects(runAsMember(() => service.create("rp-1")), /单张报告照片不能超过 10 MB/);
  assert.equal(readCount, 0);
});

test("rejects a source image above the pixel limit", async () => {
  const database = { inspectionReport: { findUnique: async () => reportRecord(1) } };
  const oversizedSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="5000" height="5000"><rect width="100%" height="100%" fill="red"/></svg>');
  const fileReader = { realpath: async (path: string) => path, stat: async () => ({ size: oversizedSvg.length }), readFile: async () => oversizedSvg };
  const service = new ReportPdfService(database as never, pdfBrowserLauncher() as never, undefined, fileReader as never);

  await assert.rejects(runAsMember(() => service.create("rp-1")), /照片像素不能超过/);
});

test("embeds every source image as a bounded JPEG preview", async () => {
  const report = reportRecord(1);
  report.photos[0].taskPhoto.mediaAsset.mimeType = "image/svg+xml";
  const sourceSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="1000"><rect width="100%" height="100%" fill="blue"/></svg>');
  const database = { inspectionReport: { findUnique: async () => report } };
  const fileReader = { realpath: async (path: string) => path, stat: async () => ({ size: sourceSvg.length }), readFile: async () => sourceSvg };
  let capturedHtml = "";
  const launcher = {
    launch: async () => ({
      newPage: async () => ({
        setContent: async (html: string) => { capturedHtml = html; },
        pdf: async () => Uint8Array.from([37, 80, 68, 70]),
      }),
      close: async () => {},
    }),
  };
  const service = new ReportPdfService(database as never, launcher as never, undefined, fileReader as never);

  await runAsMember(() => service.create("rp-1"));
  const encodedPreview = capturedHtml.match(/data:image\/jpeg;base64,([^"&]+)/)?.[1];
  assert.ok(encodedPreview);
  const metadata = await sharp(Buffer.from(encodedPreview, "base64")).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.ok((metadata.width ?? 0) <= REPORT_PDF_PREVIEW_MAX_EDGE);
  assert.ok((metadata.height ?? 0) <= REPORT_PDF_PREVIEW_MAX_EDGE);
});

test("globally gates concurrent PDF exports", async () => {
  const gate = createConcurrencyGate(1);
  const database = { inspectionReport: { findUnique: async () => reportRecord() } };
  let active = 0;
  let maximumActive = 0;
  let releaseFirst!: () => void;
  let launchCount = 0;
  const launcher = {
    launch: async () => {
      launchCount += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (launchCount === 1) await new Promise<void>((resolveLaunch) => { releaseFirst = resolveLaunch; });
      return {
        newPage: async () => ({ setContent: async () => {}, pdf: async () => Uint8Array.from([37, 80, 68, 70]) }),
        close: async () => { active -= 1; },
      };
    },
  };
  const firstService = new ReportPdfService(database as never, launcher as never, gate as never);
  const secondService = new ReportPdfService(database as never, launcher as never, gate as never);

  const first = runAsMember(() => firstService.create("rp-1"));
  await new Promise((resolveWait) => setImmediate(resolveWait));
  const second = runAsMember(() => secondService.create("rp-1"));
  await new Promise((resolveWait) => setImmediate(resolveWait));
  assert.equal(launchCount, 1);
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(maximumActive, 1);
});

test("rejects immediately with 429 when the export wait queue is full", async () => {
  const gate = createConcurrencyGate(1, { maxQueue: 1, waitTimeoutMs: 100 });
  let releaseActive!: () => void;
  const active = gate.run(() => new Promise<void>((resolveTask) => { releaseActive = resolveTask; }));
  await new Promise((resolveWait) => setImmediate(resolveWait));
  const queued = gate.run(async () => {});
  await new Promise((resolveWait) => setImmediate(resolveWait));
  const overflow = gate.run(async () => {});

  try {
    await assert.rejects(
      Promise.race([
        overflow,
        new Promise((_, reject) => setTimeout(() => reject(new Error("队列满请求没有快速失败")), 30)),
      ]),
      (error) => error instanceof Error
        && /导出队列已满/.test(error.message)
        && "getStatus" in error
        && (error as { getStatus(): number }).getStatus() === 429,
    );
  } finally {
    releaseActive();
    await Promise.allSettled([active, queued, overflow]);
  }
});

test("rejects a queued export with 503 after its wait timeout", async () => {
  const gate = createConcurrencyGate(1, { maxQueue: 1, waitTimeoutMs: 10 });
  let releaseActive!: () => void;
  const active = gate.run(() => new Promise<void>((resolveTask) => { releaseActive = resolveTask; }));
  await new Promise((resolveWait) => setImmediate(resolveWait));
  const queued = gate.run(async () => {});

  try {
    await assert.rejects(
      Promise.race([
        queued,
        new Promise((_, reject) => setTimeout(() => reject(new Error("等待请求没有按时失败")), 50)),
      ]),
      (error) => error instanceof Error
        && /等待导出超时/.test(error.message)
        && "getStatus" in error
        && (error as { getStatus(): number }).getStatus() === 503,
    );
  } finally {
    releaseActive();
    await active;
  }
});

test("processes at most two source images at once", async () => {
  const database = { inspectionReport: { findUnique: async () => reportRecord(5) } };
  let activeReads = 0;
  let maximumActiveReads = 0;
  const tinyPng = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
  const fileReader = {
    realpath: async (path: string) => path,
    stat: async () => ({ size: 1 }),
    readFile: async () => {
      activeReads += 1;
      maximumActiveReads = Math.max(maximumActiveReads, activeReads);
      await new Promise((resolveRead) => setImmediate(resolveRead));
      activeReads -= 1;
      return tinyPng;
    },
  };
  const service = new ReportPdfService(database as never, pdfBrowserLauncher() as never, undefined, fileReader as never);

  await runAsMember(() => service.create("rp-1"));
  assert.equal(maximumActiveReads, 2);
});

test("creates a project-scoped PDF with embedded report photos", async () => {
  const storageRoot = join(process.cwd(), "storage");
  await mkdir(storageRoot, { recursive: true });
  const tempDirectory = await mkdtemp(join(storageRoot, "report-pdf-"));
  const photoPath = join(tempDirectory, "DJI_0003.jpg");
  const storedPhotoPath = photoPath.slice(process.cwd().length + 1);
  await writeFile(photoPath, await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).jpeg().toBuffer());

  let findUniqueWhere: unknown;
  let capturedHtml = "";
  let pdfOptions: unknown;
  let browserClosed = false;
  const database = {
    inspectionReport: {
      findUnique: async (input: { where: unknown }) => {
        findUniqueWhere = input.where;
        return {
          id: "rp-1",
          title: "历史任务 / DJI_0003",
          reportDate: new Date("2026-07-08T00:00:00.000Z"),
          relatedObjectName: "曲阳路街道重点区域",
          issueCount: 1,
          contentSummary: "巡检完成",
          photos: [{
            taskPhoto: {
              id: "photo-1",
              videoTimestampMs: 65_432,
              latitude: 31.2,
              longitude: 121.4,
              mediaAsset: {
                originalFileName: "DJI_0003.jpg",
                storagePath: storedPhotoPath,
                mimeType: "image/jpeg",
                previewStoragePath: null,
                previewMimeType: null,
              },
              annotationDocument: { issueDescription: "现场描述", latitude: 31.21, longitude: 121.41 },
              sourceIssues: [{ title: "飞线问题", category: "飞线", description: "问题描述", cardStoragePath: null, cardMimeType: null }],
            },
          }],
        };
      },
    },
  };
  const browserLauncher = {
    launch: async () => ({
      newPage: async () => ({
        setContent: async (html: string) => { capturedHtml = html; },
        pdf: async (options: unknown) => {
          pdfOptions = options;
          return Uint8Array.from([37, 80, 68, 70]);
        },
      }),
      close: async () => { browserClosed = true; },
    }),
  };

  try {
    const service = new ReportPdfService(database as never, browserLauncher as never);
    const result = await runAsMember(() => service.create("rp-1"));

    assert.deepEqual(findUniqueWhere, { id: "rp-1", projectId: "quyang" });
    assert.deepEqual([...result.buffer], [37, 80, 68, 70]);
    assert.equal(result.fileName, "历史任务_DJI_0003.pdf");
    assert.match(capturedHtml, /data:image\/jpeg;base64/);
    assert.match(capturedHtml, /<dt>视频时间点<\/dt><dd>01:05<\/dd>/);
    assert.match(capturedHtml, /<dt>经纬度<\/dt><dd>31\.210000, 121\.410000<\/dd>/);
    assert.match(capturedHtml, /<footer>巡检宝 · 曲阳路街道重点区域 · 第 1 页<\/footer>/);
    assert.deepEqual(pdfOptions, { format: "A4", printBackground: true, preferCSSPageSize: true });
    assert.equal(browserClosed, true);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
