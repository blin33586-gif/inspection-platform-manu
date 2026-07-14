import assert from "node:assert/strict";
import test from "node:test";
import { renderReportPdfHtml, safePdfFileName } from "./report-pdf-template.js";

const report = {
  title: "历史任务 · DJI_20260708161256_0003_T.mp4综合报告",
  reportDate: "2026-07-08",
  relatedObjectName: "曲阳路街道重点区域",
  issueCount: 1,
  contentSummary: "巡检完成",
  photos: [{
    indexLabel: "问题 01",
    title: "飞线问题",
    fileName: "DJI_0003.jpg",
    videoTime: "01:05",
    coordinates: "31.234568, 121.456789",
    description: "现场描述",
    footer: "巡检宝 · 曲阳路街道重点区域 · 第 1 页",
    imageDataUrl: "data:image/jpeg;base64,AA==",
  }],
};

test("renders one A4 photo page and long-title wrapping rules", () => {
  const html = renderReportPdfHtml(report);
  assert.match(html, /class="report-cover"/);
  assert.equal((html.match(/class="report-photo-page"/g) ?? []).length, 1);
  assert.match(html, /overflow-wrap:\s*anywhere/);
  assert.match(html, /DJI_20260708161256_0003_T\.mp4/);
});

test("escapes report text and sanitizes the download name", () => {
  assert.doesNotMatch(renderReportPdfHtml({ ...report, title: "<script>x</script>" }), /<script>x<\/script>/);
  assert.equal(safePdfFileName('巡检/报告:*?'), "巡检_报告.pdf");
});

test("limits the PDF filename by UTF-8 bytes without splitting characters", () => {
  const fileName = safePdfFileName("超长巡检报告".repeat(100));

  assert.ok(Buffer.byteLength(fileName, "utf8") <= 180);
  assert.match(fileName, /\.pdf$/);
  assert.doesNotMatch(fileName, /�/);
});

test("renders the shared video time, coordinates, and footer on each PDF page", () => {
  const html = renderReportPdfHtml(report);

  assert.match(html, /<dt>视频时间点<\/dt><dd>01:05<\/dd>/);
  assert.match(html, /<dt>经纬度<\/dt><dd>31\.234568, 121\.456789<\/dd>/);
  assert.match(html, /<footer>巡检宝 · 曲阳路街道重点区域 · 第 1 页<\/footer>/);
});

test("keeps the cover to one A4 page with a bounded long-title region", () => {
  const html = renderReportPdfHtml({
    ...report,
    title: "极端长标题_".repeat(200),
  });

  assert.match(html, /\.report-cover\s*\{[^}]*height:\s*297mm/);
  assert.match(html, /\.report-cover\s*\{[^}]*overflow:\s*hidden/);
  assert.match(html, /\.report-title\s*\{[^}]*max-height:/);
  assert.match(html, /\.report-title\s*\{[^}]*overflow:\s*hidden/);
  assert.match(html, /\.report-title\s*\{[^}]*-webkit-line-clamp:\s*6/);
  assert.match(html, /\.report-summary\s*\{[^}]*-webkit-line-clamp:\s*6/);
  assert.match(html, /text-overflow:\s*ellipsis/);
});
