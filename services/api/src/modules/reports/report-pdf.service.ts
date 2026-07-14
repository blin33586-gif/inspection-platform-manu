import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, resolve, sep } from "node:path";
import { launch as launchPuppeteer } from "puppeteer-core";
import sharp from "sharp";
import { buildReportPhotoPageModel } from "@xunjianbao/shared";
import { DatabaseService } from "../../database/database.service.js";
import { currentProjectId } from "../auth/project-context.js";
import { resolvePdfBrowserExecutable } from "./pdf-browser-runtime.js";
import { renderReportPdfHtml, safePdfFileName, type ReportPdfPhoto } from "./report-pdf-template.js";

export const REPORT_PDF_BROWSER_LAUNCHER = "REPORT_PDF_BROWSER_LAUNCHER";
export const REPORT_PDF_EXPORT_GATE = "REPORT_PDF_EXPORT_GATE";
export const REPORT_PDF_FILE_READER = "REPORT_PDF_FILE_READER";
export const REPORT_PDF_MAX_PHOTOS = 100;
export const REPORT_PDF_MAX_INPUT_BYTES = 100 * 1024 * 1024;
const REPORT_PDF_IMAGE_CONCURRENCY = 2;
const REPORT_PDF_EXPORT_CONCURRENCY = 2;

interface PdfBrowserLauncher {
  launch(options: {
    executablePath: string;
    headless: true;
    args: string[];
  }): Promise<{
    newPage(): Promise<{
      setContent(html: string, options: { waitUntil: "networkidle0" }): Promise<void>;
      pdf(options: { format: "A4"; printBackground: true; preferCSSPageSize: true }): Promise<Uint8Array>;
    }>;
    close(): Promise<void>;
  }>;
}

interface ReportPdfFileReader {
  stat(path: string): Promise<{ size: number }>;
  readFile(path: string): Promise<Buffer>;
}

export interface ReportPdfConcurrencyGate {
  run<T>(task: () => Promise<T>): Promise<T>;
}

const defaultBrowserLauncher: PdfBrowserLauncher = {
  launch: (options) => launchPuppeteer(options),
};

const defaultFileReader: ReportPdfFileReader = { stat, readFile };

export function createConcurrencyGate(limit: number): ReportPdfConcurrencyGate {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("并发上限必须是正整数");
  let active = 0;
  const waiters: Array<() => void> = [];

  return {
    async run<T>(task: () => Promise<T>) {
      if (active >= limit) await new Promise<void>((resolveWaiter) => waiters.push(resolveWaiter));
      active += 1;
      try {
        return await task();
      } finally {
        active -= 1;
        waiters.shift()?.();
      }
    },
  };
}

const globalReportPdfExportGate = createConcurrencyGate(REPORT_PDF_EXPORT_CONCURRENCY);

const browserImageMimeTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

export function resolveReportStoragePath(storagePath: string, cwd = process.cwd()) {
  const storageRoot = resolve(cwd, "storage");
  const candidate = resolve(cwd, storagePath);
  if (isAbsolute(storagePath) || !candidate.startsWith(`${storageRoot}${sep}`)) {
    throw new BadRequestException("报告照片存储路径无效");
  }
  return candidate;
}

@Injectable()
export class ReportPdfService {
  private readonly browserLauncher: PdfBrowserLauncher;
  private readonly exportGate: ReportPdfConcurrencyGate;
  private readonly fileReader: ReportPdfFileReader;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject(REPORT_PDF_BROWSER_LAUNCHER) browserLauncher?: PdfBrowserLauncher,
    @Optional() @Inject(REPORT_PDF_EXPORT_GATE) exportGate?: ReportPdfConcurrencyGate,
    @Optional() @Inject(REPORT_PDF_FILE_READER) fileReader?: ReportPdfFileReader,
  ) {
    this.browserLauncher = browserLauncher ?? defaultBrowserLauncher;
    this.exportGate = exportGate ?? globalReportPdfExportGate;
    this.fileReader = fileReader ?? defaultFileReader;
  }

  async create(reportId: string): Promise<{ buffer: Uint8Array; fileName: string }> {
    const projectId = currentProjectId();
    const report = await this.database.inspectionReport.findUnique({
      where: { id: reportId, projectId },
      include: {
        photos: {
          orderBy: { sortIndex: "asc" },
          include: {
            taskPhoto: {
              include: {
                mediaAsset: true,
                annotationDocument: true,
                sourceIssues: {
                  where: { projectId, cardStoragePath: { not: null } },
                  orderBy: { updatedAt: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!report) throw new NotFoundException("Report not found");
    if (report.photos.length > REPORT_PDF_MAX_PHOTOS) {
      throw new BadRequestException(`报告照片不能超过 ${REPORT_PDF_MAX_PHOTOS} 张`);
    }

    return this.exportGate.run(async () => {
      const sources = report.photos.map(({ taskPhoto }) => {
        const issue = taskPhoto.sourceIssues[0];
        const source = issue?.cardStoragePath
          ? { path: issue.cardStoragePath, mimeType: issue.cardMimeType }
          : taskPhoto.mediaAsset.previewStoragePath
            ? { path: taskPhoto.mediaAsset.previewStoragePath, mimeType: taskPhoto.mediaAsset.previewMimeType }
            : { path: taskPhoto.mediaAsset.storagePath, mimeType: taskPhoto.mediaAsset.mimeType };
        return { taskPhoto, issue, source, resolvedPath: resolveReportStoragePath(source.path) };
      });

      let totalInputBytes = 0;
      for (const source of sources) {
        totalInputBytes += (await this.fileReader.stat(source.resolvedPath)).size;
        if (totalInputBytes > REPORT_PDF_MAX_INPUT_BYTES) {
          throw new BadRequestException("报告照片文件总大小不能超过 100 MB");
        }
      }

      const photos = await mapWithConcurrency(sources, REPORT_PDF_IMAGE_CONCURRENCY, async ({ taskPhoto, issue, source, resolvedPath }, index): Promise<ReportPdfPhoto> => ({
        ...buildReportPhotoPageModel({
          index,
          relatedObjectName: report.relatedObjectName,
          fileName: taskPhoto.mediaAsset.originalFileName,
          issueTitle: issue?.title,
          issueCategory: issue?.category,
          issueDescription: taskPhoto.annotationDocument?.issueDescription ?? issue?.description,
          videoTimestampMs: taskPhoto.videoTimestampMs,
          latitude: taskPhoto.annotationDocument?.latitude ?? taskPhoto.latitude,
          longitude: taskPhoto.annotationDocument?.longitude ?? taskPhoto.longitude,
        }),
        imageDataUrl: await this.readImageDataUrl(resolvedPath, source.path, source.mimeType),
      }));
      const html = renderReportPdfHtml({
        title: report.title,
        reportDate: report.reportDate.toISOString().slice(0, 10),
        relatedObjectName: report.relatedObjectName,
        issueCount: report.issueCount,
        contentSummary: report.contentSummary,
        photos,
      });

      const browser = await this.browserLauncher.launch({
        executablePath: resolvePdfBrowserExecutable(),
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const buffer = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
        return { buffer, fileName: safePdfFileName(report.title) };
      } finally {
        await browser.close();
      }
    });
  }

  private async readImageDataUrl(resolvedPath: string, storagePath: string, declaredMimeType: string | null) {
    let bytes = await this.fileReader.readFile(resolvedPath);
    let mimeType = declaredMimeType || mimeTypeFromPath(storagePath);
    if (!browserImageMimeTypes.has(mimeType)) {
      bytes = await sharp(bytes).jpeg().toBuffer();
      mimeType = "image/jpeg";
    }
    return `data:${mimeType};base64,${bytes.toString("base64")}`;
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, map: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function mimeTypeFromPath(filePath: string) {
  switch (extname(filePath).toLowerCase()) {
    case ".avif": return "image/avif";
    case ".gif": return "image/gif";
    case ".jpeg":
    case ".jpg": return "image/jpeg";
    case ".png": return "image/png";
    case ".svg": return "image/svg+xml";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
}
