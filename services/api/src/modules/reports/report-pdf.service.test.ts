import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { runAsMember } from "../../test-support/auth-context.js";
import {
  createConcurrencyGate,
  REPORT_PDF_MAX_INPUT_BYTES,
  REPORT_PDF_MAX_PHOTOS,
  ReportPdfService,
  resolveReportStoragePath,
} from "./report-pdf.service.js";

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
    stat: async () => ({ size: 1 }),
    readFile: async () => { readCount += 1; return Buffer.from("image"); },
  };
  const service = new ReportPdfService(database as never, pdfBrowserLauncher() as never, undefined, fileReader as never);

  await assert.rejects(runAsMember(() => service.create("rp-1")), /报告照片不能超过/);
  assert.equal(readCount, 0);
});

test("rejects cumulative source image bytes above the report limit", async () => {
  const database = { inspectionReport: { findUnique: async () => reportRecord(2) } };
  const fileReader = {
    stat: async () => ({ size: Math.floor(REPORT_PDF_MAX_INPUT_BYTES / 2) + 1 }),
    readFile: async () => Buffer.from("image"),
  };
  const service = new ReportPdfService(database as never, pdfBrowserLauncher() as never, undefined, fileReader as never);

  await assert.rejects(runAsMember(() => service.create("rp-1")), /照片文件总大小不能超过/);
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

test("processes at most two source images at once", async () => {
  const database = { inspectionReport: { findUnique: async () => reportRecord(5) } };
  let activeReads = 0;
  let maximumActiveReads = 0;
  const fileReader = {
    stat: async () => ({ size: 1 }),
    readFile: async () => {
      activeReads += 1;
      maximumActiveReads = Math.max(maximumActiveReads, activeReads);
      await new Promise((resolveRead) => setImmediate(resolveRead));
      activeReads -= 1;
      return Buffer.from("image");
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
  await writeFile(photoPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

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
