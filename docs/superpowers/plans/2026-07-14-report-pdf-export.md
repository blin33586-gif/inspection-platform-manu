# Report PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a real downloadable PDF for generated reports and keep long report titles inside the screen and A4 page boundaries.

**Architecture:** The API renders a self-contained HTML document, launches the installed Chromium-compatible browser through `puppeteer-core`, and returns the generated PDF buffer from a project-scoped endpoint. The admin UI downloads that authenticated response as a file and keeps browser printing as a secondary action.

**Tech Stack:** NestJS 10, Prisma 7, Puppeteer Core 24, React 18, Ant Design 5, Node test runner, CSS print rules.

## Global Constraints

- `GET /api/v1/reports/:id/pdf` must apply the current project context before reading a report.
- The PDF contains one cover page followed by one page per selected report photo.
- Chinese text and long filename-like titles must wrap without horizontal overflow.
- The primary action downloads `.pdf`; browser print remains a separate secondary action.
- Do not introduce a second report template with different copy or layout rules.

---

### Task 1: PDF browser runtime

**Files:**
- Modify: `services/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `services/api/Dockerfile`
- Create: `services/api/src/modules/reports/pdf-browser-runtime.ts`
- Test: `services/api/src/modules/reports/pdf-browser-runtime.test.ts`

**Interfaces:**
- Produces: `resolvePdfBrowserExecutable(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string`
- Produces: direct API dependency on `puppeteer-core@^24.15.0`

- [ ] **Step 1: Write the failing runtime resolver test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolvePdfBrowserExecutable } from "./pdf-browser-runtime.js";

test("prefers the configured PDF browser", () => {
  assert.equal(resolvePdfBrowserExecutable({ PDF_BROWSER_EXECUTABLE: "/opt/chromium" }, "linux"), "/opt/chromium");
});

test("uses the standard macOS Chrome path", () => {
  assert.equal(resolvePdfBrowserExecutable({}, "darwin"), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
});

test("uses the container Chromium path on Linux", () => {
  assert.equal(resolvePdfBrowserExecutable({}, "linux"), "/usr/bin/chromium");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/pdf-browser-runtime.test.ts`

Expected: FAIL because `pdf-browser-runtime.ts` does not exist.

- [ ] **Step 3: Implement the runtime resolver and install the direct dependency**

```ts
export function resolvePdfBrowserExecutable(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
) {
  if (env.PDF_BROWSER_EXECUTABLE?.trim()) return env.PDF_BROWSER_EXECUTABLE.trim();
  if (platform === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (platform === "win32") return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return "/usr/bin/chromium";
}
```

Run: `corepack pnpm --filter @xunjianbao/api add puppeteer-core@^24.15.0`

Add Chromium and Chinese fonts to the API image:

```dockerfile
RUN apk add --no-cache chromium font-noto-cjk
ENV PDF_BROWSER_EXECUTABLE=/usr/bin/chromium
```

- [ ] **Step 4: Run the runtime test**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/pdf-browser-runtime.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Commit the runtime**

```bash
git add services/api/package.json pnpm-lock.yaml services/api/Dockerfile services/api/src/modules/reports/pdf-browser-runtime.ts services/api/src/modules/reports/pdf-browser-runtime.test.ts
git commit -m "build: add report PDF browser runtime"
```

### Task 2: Self-contained report HTML renderer

**Files:**
- Create: `services/api/src/modules/reports/report-pdf-template.ts`
- Test: `services/api/src/modules/reports/report-pdf-template.test.ts`

**Interfaces:**
- Produces: `ReportPdfDocument` and `ReportPdfPhoto` input types
- Produces: `renderReportPdfHtml(report: ReportPdfDocument): string`
- Produces: `safePdfFileName(title: string): string`

- [ ] **Step 1: Write the failing renderer tests**

```ts
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
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf-template.test.ts`

Expected: FAIL because the renderer is missing.

- [ ] **Step 3: Implement the renderer**

Implement a pure renderer whose stylesheet includes these exact page and title rules:

```ts
const styles = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1d1d1f; font-family: "Noto Sans CJK SC", "PingFang SC", sans-serif; }
  .report-cover, .report-photo-page { width: 210mm; min-height: 297mm; padding: 18mm; break-after: page; page-break-after: always; }
  .report-title { margin: 7mm 0 14mm; font-size: clamp(28px, 4.8vw, 46px); line-height: 1.18; overflow-wrap: anywhere; word-break: break-word; }
  .report-photo { width: 100%; max-height: 178mm; object-fit: contain; background: #eef3f8; }
`;

export function safePdfFileName(title: string) {
  const clean = title.replace(/[\\/:*?"<>|]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim();
  return `${clean || "巡检报告"}.pdf`;
}
```

Use one `report-cover` section and map every photo to one `report-photo-page` section. Escape `&`, `<`, `>`, `"`, and `'` before inserting text into HTML.

- [ ] **Step 4: Run the renderer tests**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf-template.test.ts`

Expected: all renderer tests pass.

- [ ] **Step 5: Commit the renderer**

```bash
git add services/api/src/modules/reports/report-pdf-template.ts services/api/src/modules/reports/report-pdf-template.test.ts
git commit -m "feat: render printable report PDF HTML"
```

### Task 3: Project-scoped PDF endpoint

**Files:**
- Create: `services/api/src/modules/reports/report-pdf.service.ts`
- Test: `services/api/src/modules/reports/report-pdf.service.test.ts`
- Modify: `services/api/src/modules/reports/reports.controller.ts`
- Modify: `services/api/src/modules/reports/reports.module.ts`

**Interfaces:**
- Consumes: `renderReportPdfHtml(report)` and `resolvePdfBrowserExecutable()`
- Produces: `ReportPdfService.create(reportId: string): Promise<{ buffer: Uint8Array; fileName: string }>`
- Produces: authenticated `GET /reports/:id/pdf`

- [ ] **Step 1: Write the failing service test**

Create a fake database whose `inspectionReport.findUnique` records its `where` input and returns one report with one photo. Inject a fake browser launcher whose page returns `Uint8Array.from([37, 80, 68, 70])`. Assert:

```ts
assert.deepEqual(findUniqueWhere, { id: "rp-1", projectId: "quyang" });
assert.deepEqual([...result.buffer], [37, 80, 68, 70]);
assert.equal(result.fileName, "历史任务_DJI_0003.pdf");
assert.match(capturedHtml, /data:image\/jpeg;base64/);
assert.deepEqual(pdfOptions, { format: "A4", printBackground: true, preferCSSPageSize: true });
```

Run the service inside `runAsMember(...)` so the current project is available.

- [ ] **Step 2: Run the service test and verify it fails**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf.service.test.ts`

Expected: FAIL because `ReportPdfService` is missing.

- [ ] **Step 3: Implement the service and controller endpoint**

The service must:

```ts
const report = await this.database.inspectionReport.findUnique({
  where: { id: reportId, projectId: currentProjectId() },
  include: {
    photos: {
      orderBy: { sortIndex: "asc" },
      include: { taskPhoto: { include: { mediaAsset: true, annotationDocument: true, sourceIssues: { where: { projectId: currentProjectId(), cardStoragePath: { not: null } }, orderBy: { updatedAt: "desc" }, take: 1 } } } },
    },
  },
});
```

For each page, prefer the issue card path, otherwise prefer the media preview path, otherwise use the source media path. Read the file, convert unsupported formats to JPEG with existing `sharp`, and embed it as a data URL. Launch Puppeteer with the resolved executable, `headless: true`, and `args: ["--no-sandbox", "--disable-dev-shm-usage"]`. Always close the browser in `finally`.

The controller endpoint sends the bytes directly:

```ts
@Get(":id/pdf")
async pdf(@Param("id") id: string, @Res() response: Response) {
  const result = await this.pdfService.create(id);
  response.type("application/pdf");
  response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);
  return response.send(Buffer.from(result.buffer));
}
```

- [ ] **Step 4: Run report API tests and typecheck**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/*.test.ts`

Expected: all report tests pass.

Run: `corepack pnpm --filter @xunjianbao/api typecheck`

Expected: exit code 0.

- [ ] **Step 5: Commit the endpoint**

```bash
git add services/api/src/modules/reports/report-pdf.service.ts services/api/src/modules/reports/report-pdf.service.test.ts services/api/src/modules/reports/reports.controller.ts services/api/src/modules/reports/reports.module.ts
git commit -m "feat: export generated reports as PDF"
```

### Task 4: Download action and responsive title layout

**Files:**
- Create: `apps/admin-web/src/pages/report-export.ts`
- Test: `apps/admin-web/src/pages/report-export.test.ts`
- Modify: `apps/admin-web/src/api/client.ts`
- Modify: `apps/admin-web/src/pages/ReportDetailPage.tsx`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Produces: `downloadApiFile(path: string, fallbackFileName: string): Promise<void>`
- Produces: `getReportDownloadName(title: string): string`

- [ ] **Step 1: Write the failing filename test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getReportDownloadName } from "./report-export.js";

test("creates a safe PDF filename", () => {
  assert.equal(getReportDownloadName("历史任务 / DJI_0003"), "历史任务_DJI_0003.pdf");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/report-export.test.ts`

Expected: FAIL because `report-export.ts` is missing.

- [ ] **Step 3: Implement authenticated download and page actions**

Add `downloadApiFile` beside the existing API helpers. It must call `fetch` with `authHeaders()`, reject through `parseApiError`, create an object URL from `response.blob()`, click a temporary anchor with `download`, then revoke the object URL.

In `ReportDetailPage`, add `exporting` state and use:

```tsx
<Button loading={exporting} type="primary" onClick={() => void exportPdf()}>导出 PDF</Button>
<Button icon={<Printer size={16} />} onClick={() => window.print()}>打印</Button>
```

Add these layout rules:

```css
.topbar h1, .html-report-cover h1 { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
.html-report-cover h1 { max-width: 100%; font-size: clamp(34px, 5vw, 48px); line-height: 1.16; }
@media (max-width: 900px) {
  .topbar { align-items: flex-start; }
  .topbar > div:first-child { min-width: 0; }
}
```

- [ ] **Step 4: Run frontend checks**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/report-export.test.ts`

Expected: test passes.

Run: `corepack pnpm --filter @xunjianbao/admin-web typecheck`

Expected: exit code 0.

- [ ] **Step 5: Commit the UI**

```bash
git add apps/admin-web/src/pages/report-export.ts apps/admin-web/src/pages/report-export.test.ts apps/admin-web/src/api/client.ts apps/admin-web/src/pages/ReportDetailPage.tsx apps/admin-web/src/styles/global.css
git commit -m "fix: download report PDFs and wrap long titles"
```

### Task 5: Real PDF verification

**Files:**
- Modify only if verification exposes a defect in Task 1–4 files.

**Interfaces:**
- Consumes: running API, admin web, and PostgreSQL development stack.
- Produces: verified PDF bytes and browser layout evidence.

- [ ] **Step 1: Run focused automated checks**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/*.test.ts`

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/report-export.test.ts`

Run: `corepack pnpm --filter @xunjianbao/api typecheck && corepack pnpm --filter @xunjianbao/admin-web typecheck`

Expected: all commands exit 0.

- [ ] **Step 2: Verify a downloaded PDF**

Start the stable stack, log in, open report `rp-55895eee-827c-42fd-b327-77086d27f46b`, click “导出 PDF”, and confirm the response starts with `%PDF` and is larger than 1 KB.

- [ ] **Step 3: Verify the 825px layout**

At a viewport width of 825px, confirm the long title wraps within the page header and the A4 preview. Confirm the export and print buttons remain visible.

- [ ] **Step 4: Commit verification fixes if any**

```bash
git add services/api apps/admin-web
git commit -m "fix: harden report PDF export verification"
```
