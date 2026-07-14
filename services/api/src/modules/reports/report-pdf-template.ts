import { REPORT_DOCUMENT_COPY, type ReportPhotoPageModel } from "@xunjianbao/shared";

export interface ReportPdfPhoto extends ReportPhotoPageModel {
  imageDataUrl: string;
}

export interface ReportPdfDocument {
  title: string;
  reportDate: string;
  relatedObjectName: string;
  issueCount: number;
  contentSummary?: string | null;
  photos: ReportPdfPhoto[];
}

const styles = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1d1d1f; font-family: "Noto Sans CJK SC", "PingFang SC", sans-serif; }
  .report-cover, .report-photo-page { width: 210mm; height: 297mm; overflow: hidden; padding: 18mm; break-after: page; page-break-after: always; }
  .report-cover { height: 297mm; overflow: hidden; display: grid; grid-template-rows: auto minmax(0, 86mm) auto minmax(0, 48mm); align-content: center; }
  .report-title { max-height: 86mm; margin: 7mm 0 14mm; overflow: hidden; font-size: clamp(28px, 4.8vw, 46px); line-height: 1.18; overflow-wrap: anywhere; word-break: break-word; }
  .report-kicker, .photo-index { color: #1677ff; font-size: 14px; font-weight: 700; letter-spacing: 0.08em; }
  .report-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8mm; margin: 0; }
  .report-meta div { border-top: 1px solid #d9e2ec; padding-top: 3mm; }
  .report-meta dt { color: #667085; font-size: 12px; }
  .report-meta dd { margin: 2mm 0 0; font-size: 18px; font-weight: 650; }
  .report-summary { max-height: 48mm; margin-top: 14mm; overflow: hidden; color: #475467; font-size: 16px; line-height: 1.7; white-space: pre-wrap; }
  .report-photo-page { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto; gap: 4mm; }
  .photo-title { margin: 3mm 0 8mm; font-size: 28px; line-height: 1.25; overflow-wrap: anywhere; word-break: break-word; }
  .report-photo { width: 100%; max-height: 178mm; object-fit: contain; background: #eef3f8; }
  .photo-meta { margin-top: 6mm; color: #475467; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; word-break: break-word; }
  .photo-meta dl { display: grid; gap: 2mm; margin: 0; }
  .photo-meta dl div { display: grid; grid-template-columns: 30mm minmax(0, 1fr); gap: 3mm; }
  .photo-meta dt { color: #667085; }
  .photo-meta dd { margin: 0; font-weight: 650; }
  .report-photo-page footer { margin-top: 5mm; border-top: 1px solid #d9e2ec; padding-top: 3mm; color: #667085; font-size: 12px; text-align: right; }
`;

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safePdfFileName(title: string) {
  const clean = title
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s*_\s*/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .trim();
  return `${clean || "巡检报告"}.pdf`;
}

export function renderReportPdfHtml(report: ReportPdfDocument) {
  const photoPages = report.photos.map((photo) => `
    <section class="report-photo-page">
      <span class="photo-index">${escapeHtml(photo.indexLabel)}</span>
      <h2 class="photo-title">${escapeHtml(photo.title)}</h2>
      <img class="report-photo" src="${escapeHtml(photo.imageDataUrl)}" alt="${escapeHtml(photo.fileName)}">
      <div class="photo-meta">
        <dl>
          <div><dt>${REPORT_DOCUMENT_COPY.photoFile}</dt><dd>${escapeHtml(photo.fileName)}</dd></div>
          ${photo.videoTime ? `<div><dt>${REPORT_DOCUMENT_COPY.videoTime}</dt><dd>${escapeHtml(photo.videoTime)}</dd></div>` : ""}
          ${photo.coordinates ? `<div><dt>${REPORT_DOCUMENT_COPY.coordinates}</dt><dd>${escapeHtml(photo.coordinates)}</dd></div>` : ""}
        </dl>
        <p>${escapeHtml(photo.description)}</p>
      </div>
      <footer>${escapeHtml(photo.footer)}</footer>
    </section>
  `).join("");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${styles}</style>
  </head>
  <body>
    <section class="report-cover">
      <span class="report-kicker">${REPORT_DOCUMENT_COPY.kicker}</span>
      <h1 class="report-title">${escapeHtml(report.title)}</h1>
      <dl class="report-meta">
        <div><dt>${REPORT_DOCUMENT_COPY.reportDate}</dt><dd>${escapeHtml(report.reportDate)}</dd></div>
        <div><dt>${REPORT_DOCUMENT_COPY.relatedObject}</dt><dd>${escapeHtml(report.relatedObjectName)}</dd></div>
        <div><dt>${REPORT_DOCUMENT_COPY.issueCount}</dt><dd>${escapeHtml(report.issueCount)}</dd></div>
        <div><dt>${REPORT_DOCUMENT_COPY.photoCount}</dt><dd>${escapeHtml(report.photos.length)}</dd></div>
      </dl>
      ${report.contentSummary ? `<p class="report-summary">${escapeHtml(report.contentSummary)}</p>` : ""}
    </section>
    ${photoPages}
  </body>
</html>`;
}
