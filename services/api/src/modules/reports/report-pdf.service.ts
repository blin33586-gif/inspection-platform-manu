import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
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
export const REPORT_PDF_MAX_SINGLE_IMAGE_BYTES = 10 * 1024 * 1024;
export const REPORT_PDF_MAX_INPUT_BYTES = 50 * 1024 * 1024;
export const REPORT_PDF_MAX_PIXELS = 20_000_000;
export const REPORT_PDF_PREVIEW_MAX_EDGE = 2000;
const REPORT_PDF_IMAGE_CONCURRENCY = 2;
export const REPORT_PDF_EXPORT_CONCURRENCY = 1;
const REPORT_PDF_EXPORT_MAX_QUEUE = 3;
const REPORT_PDF_EXPORT_WAIT_TIMEOUT_MS = 15_000;

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
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<{ size: number }>;
  readFile(path: string): Promise<Buffer>;
}

export interface ReportPdfConcurrencyGate {
  run<T>(task: () => Promise<T>): Promise<T>;
}

interface ReportPdfConcurrencyGateOptions {
  maxQueue: number;
  waitTimeoutMs: number;
}

const defaultBrowserLauncher: PdfBrowserLauncher = {
  launch: (options) => launchPuppeteer(options),
};

const defaultFileReader: ReportPdfFileReader = { realpath, stat, readFile };

export function createConcurrencyGate(
  limit: number,
  options: ReportPdfConcurrencyGateOptions = {
    maxQueue: REPORT_PDF_EXPORT_MAX_QUEUE,
    waitTimeoutMs: REPORT_PDF_EXPORT_WAIT_TIMEOUT_MS,
  },
): ReportPdfConcurrencyGate {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("并发上限必须是正整数");
  if (!Number.isInteger(options.maxQueue) || options.maxQueue < 0) throw new Error("等待队列上限不能为负数");
  if (!Number.isFinite(options.waitTimeoutMs) || options.waitTimeoutMs < 1) throw new Error("等待超时必须大于 0");
  let active = 0;
  const waiters: Array<{ grant(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }> = [];

  async function acquire() {
    if (active < limit) {
      active += 1;
      return;
    }
    if (waiters.length >= options.maxQueue) {
      throw new HttpException("PDF 导出队列已满，请稍后重试", 429);
    }
    await new Promise<void>((resolveWaiter, rejectWaiter) => {
      const waiter = {
        grant: () => {
          clearTimeout(waiter.timer);
          resolveWaiter();
        },
        reject: rejectWaiter,
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
      };
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        waiter.reject(new HttpException("等待导出超时，请稍后重试", 503));
      }, options.waitTimeoutMs);
      waiters.push(waiter);
    });
  }

  return {
    async run<T>(task: () => Promise<T>) {
      await acquire();
      try {
        return await task();
      } finally {
        const next = waiters.shift();
        if (next) next.grant();
        else active -= 1;
      }
    },
  };
}

const globalReportPdfExportGate = createConcurrencyGate(REPORT_PDF_EXPORT_CONCURRENCY);

export function resolveReportStoragePath(storagePath: string, cwd = process.cwd()) {
  const storageRoot = resolve(cwd, "storage");
  const candidate = resolve(cwd, storagePath);
  if (isAbsolute(storagePath) || !candidate.startsWith(`${storageRoot}${sep}`)) {
    throw new BadRequestException("报告照片存储路径无效");
  }
  return candidate;
}

export function assertReportStorageRealPath(realPath: string, realStorageRoot: string) {
  const storageRoot = resolve(realStorageRoot);
  const candidate = resolve(realPath);
  if (!candidate.startsWith(`${storageRoot}${sep}`)) {
    throw new BadRequestException("报告照片真实路径不在 storage 目录内");
  }
  return candidate;
}

export async function resolveStoredPath(
  storagePath: string,
  cwd = process.cwd(),
  resolveRealPath: (path: string) => Promise<string> = realpath,
) {
  const lexicalPath = resolveReportStoragePath(storagePath, cwd);
  const [realStorageRoot, realFilePath] = await Promise.all([
    resolveRealPath(resolve(cwd, "storage")),
    resolveRealPath(lexicalPath),
  ]);
  return assertReportStorageRealPath(realFilePath, realStorageRoot);
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
        return { taskPhoto, issue, source, resolvedPath: source.path };
      });

      let totalInputBytes = 0;
      for (const source of sources) {
        source.resolvedPath = await resolveStoredPath(source.source.path, process.cwd(), (path) => this.fileReader.realpath(path));
        const sourceBytes = (await this.fileReader.stat(source.resolvedPath)).size;
        if (sourceBytes > REPORT_PDF_MAX_SINGLE_IMAGE_BYTES) {
          throw new BadRequestException("单张报告照片不能超过 10 MB");
        }
        totalInputBytes += sourceBytes;
        if (totalInputBytes > REPORT_PDF_MAX_INPUT_BYTES) {
          throw new BadRequestException("报告照片文件总大小不能超过 50 MB");
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
        imageDataUrl: await this.readImageDataUrl(resolvedPath),
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

  private async readImageDataUrl(resolvedPath: string) {
    const bytes = await this.fileReader.readFile(resolvedPath);
    try {
      const preview = await sharp(bytes, { limitInputPixels: REPORT_PDF_MAX_PIXELS })
        .rotate()
        .resize({
          width: REPORT_PDF_PREVIEW_MAX_EDGE,
          height: REPORT_PDF_PREVIEW_MAX_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 82 })
        .toBuffer();
      return `data:image/jpeg;base64,${preview.toString("base64")}`;
    } catch (error) {
      if (error instanceof Error && /pixel limit|exceeds.*pixel/i.test(error.message)) {
        throw new BadRequestException(`报告照片像素不能超过 ${REPORT_PDF_MAX_PIXELS.toLocaleString("en-US")}`);
      }
      throw new BadRequestException("报告照片无法生成受控预览");
    }
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
