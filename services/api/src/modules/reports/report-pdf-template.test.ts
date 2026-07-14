import assert from "node:assert/strict";
import test from "node:test";
import { renderReportPdfHtml, safePdfFileName } from "./report-pdf-template.js";

const report = {
  title: "历史任务 · DJI_20260708161256_0003_T.mp4综合报告",
  reportDate: "2026-07-08",
  relatedObjectName: "曲阳路街道重点区域",
  issueCount: 1,
  contentSummary: "巡检完成",
  photos: [{ title: "飞线问题", fileName: "DJI_0003.jpg", description: "现场描述", imageDataUrl: "data:image/jpeg;base64,AA==" }],
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
