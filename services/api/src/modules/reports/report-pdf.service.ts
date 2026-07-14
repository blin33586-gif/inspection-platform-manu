import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { launch as launchPuppeteer } from "puppeteer-core";
import sharp from "sharp";
import { DatabaseService } from "../../database/database.service.js";
import { currentProjectId } from "../auth/project-context.js";
import { resolvePdfBrowserExecutable } from "./pdf-browser-runtime.js";
import { renderReportPdfHtml, safePdfFileName, type ReportPdfPhoto } from "./report-pdf-template.js";

export const REPORT_PDF_BROWSER_LAUNCHER = "REPORT_PDF_BROWSER_LAUNCHER";

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

const defaultBrowserLauncher: PdfBrowserLauncher = {
  launch: (options) => launchPuppeteer(options),
};

const browserImageMimeTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

@Injectable()
export class ReportPdfService {
  private readonly browserLauncher: PdfBrowserLauncher;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject(REPORT_PDF_BROWSER_LAUNCHER) browserLauncher?: PdfBrowserLauncher,
  ) {
    this.browserLauncher = browserLauncher ?? defaultBrowserLauncher;
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

    const photos = await Promise.all(report.photos.map(async ({ taskPhoto }): Promise<ReportPdfPhoto> => {
      const issue = taskPhoto.sourceIssues[0];
      const source = issue?.cardStoragePath
        ? { path: issue.cardStoragePath, mimeType: issue.cardMimeType }
        : taskPhoto.mediaAsset.previewStoragePath
          ? { path: taskPhoto.mediaAsset.previewStoragePath, mimeType: taskPhoto.mediaAsset.previewMimeType }
          : { path: taskPhoto.mediaAsset.storagePath, mimeType: taskPhoto.mediaAsset.mimeType };
      return {
        title: issue?.title || issue?.category || "巡检现场照片",
        fileName: taskPhoto.mediaAsset.originalFileName,
        description: taskPhoto.annotationDocument?.issueDescription ?? issue?.description ?? null,
        imageDataUrl: await this.readImageDataUrl(source.path, source.mimeType),
      };
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
  }

  private async readImageDataUrl(storagePath: string, declaredMimeType: string | null) {
    let bytes = await readFile(resolve(process.cwd(), storagePath));
    let mimeType = declaredMimeType || mimeTypeFromPath(storagePath);
    if (!browserImageMimeTypes.has(mimeType)) {
      bytes = await sharp(bytes).jpeg().toBuffer();
      mimeType = "image/jpeg";
    }
    return `data:${mimeType};base64,${bytes.toString("base64")}`;
  }
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
