# 巡检宝可复用地图与媒体模块实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将地图资产处理、视频离线抽帧和照片标注沉淀为可复用模块，并接入巡检宝现有地图、媒体库和报告流程。

**Architecture:** 保持现有 NestJS API 和 PostgreSQL 为业务入口。地图资产在 API 内保留上传、发布和热区接口，并将 TIF 转瓦片交给独立处理任务；视频由独立 `media-worker` 使用 FFmpeg 处理，结果以子媒体资产回写数据库；标注编辑器成为 React workspace 包，使用统一相对坐标 JSON。

**Tech Stack:** React 18、Vite 5、TypeScript 5、Ant Design 5、Leaflet、React-Konva、NestJS 10、Prisma 7、PostgreSQL、FFmpeg、GDAL、Node `node:test`、tsx。

## Global Constraints

- 保持 Apple 风格的干净页面层级与稳重的政务蓝色体系。
- 已验收模块只通过公开接口被后续模块使用，不重做已有页面业务。
- 地图、视频和图片原件不得被派生文件覆盖或删除。
- 所有后台任务必须持久化状态、进度、错误原因和幂等键。
- 标注坐标使用 `0 ~ 1` 相对坐标；禁止保存任意 HTML 或 SVG 文本。
- AI 识别、实时 RTMP 和实时报警不属于本计划。
- 每个任务采用 TDD，先运行失败测试，再写最小实现；完成后运行类型检查、对应测试和构建。
- 每个任务独立提交并推送 `codex/real-workflow-v1`。

---

## File Structure

- Create: `packages/media-contracts/package.json` — 媒体、任务、标注文档公共类型包。
- Create: `packages/media-contracts/src/index.ts` — 可跨 API、worker 与前端使用的 DTO。
- Create: `packages/map-core/package.json` — 地图处理公共逻辑包。
- Create: `packages/map-core/src/tiff-job.ts` — TIF 处理任务入参与产物约束。
- Create: `packages/annotation-editor/package.json` — 可复用 React 标注编辑器包。
- Create: `packages/annotation-editor/src/AnnotationEditor.tsx` — React-Konva 标注画布。
- Create: `packages/annotation-editor/src/annotation-document.ts` — 标注 JSON 校验与坐标转换。
- Create: `packages/annotation-editor/src/annotation-document.test.ts` — 标注文档单元测试。
- Create: `services/media-worker/package.json` — 独立 FFmpeg/GDAL worker。
- Create: `services/media-worker/src/main.ts` — 领取并执行媒体任务的循环入口。
- Create: `services/media-worker/src/ffmpeg-frame-extractor.ts` — 视频探测和定时抽帧适配器。
- Create: `services/media-worker/src/gdal-tile-generator.ts` — TIF 转 COG/XYZ 适配器。
- Create: `services/media-worker/src/*.test.ts` — 命令参数和任务状态测试。
- Create: `services/api/src/modules/media/media.module.ts` — 媒体与任务模块注册。
- Create: `services/api/src/modules/media/media.controller.ts` — 媒体上传、任务创建与查询接口。
- Create: `services/api/src/modules/media/media.service.ts` — 媒体和处理任务事务逻辑。
- Create: `services/api/src/modules/media/media.service.test.ts` — 任务幂等性和帧写入测试。
- Create: `services/api/prisma/migrations/<timestamp>_media_processing/migration.sql` — 媒体资产、处理任务、标注表迁移。
- Modify: `services/api/prisma/schema.prisma` — 新增媒体和任务模型。
- Modify: `services/api/src/app.module.ts` — 注册媒体模块。
- Modify: `services/api/src/modules/map-assets/map-asset-upload.service.ts` — TIF 上传创建处理任务。
- Modify: `services/api/src/modules/map-assets/map-assets.controller.ts` — 暴露地图处理状态。
- Modify: `services/api/Dockerfile` — 安装数据库客户端、FFmpeg 与 GDAL 所需运行依赖。
- Modify: `apps/admin-web/src/components/Shell.tsx` — 使用“待跟进线索”和“操作日志”。
- Modify: `apps/admin-web/src/pages/AuditLogsPage.tsx` — 页面标题使用“操作日志”。
- Modify: `apps/admin-web/src/pages/IssuesPage.tsx` — 页面标题使用“待跟进线索”。
- Modify: `apps/admin-web/src/pages/MediaLibraryPage.tsx` — 创建视频抽帧任务并显示状态。
- Modify: `apps/admin-web/src/pages/ReportWritePage.tsx` — 以 `@xunjianbao/annotation-editor` 替换页面私有画布实现。
- Modify: `apps/admin-web/package.json` — 引用 `@xunjianbao/media-contracts` 和 `@xunjianbao/annotation-editor`。
- Modify: `services/api/package.json`、`services/media-worker/package.json`、根 `package.json` — 添加 workspace 依赖和 worker 脚本。
- Modify: `docs/开发阶段记录.md` — 记录每阶段验收结果。

## Task 1: 导航术语与共享媒体契约

**Files:**
- Create: `packages/media-contracts/package.json`
- Create: `packages/media-contracts/tsconfig.json`
- Create: `packages/media-contracts/src/index.ts`
- Modify: `apps/admin-web/src/components/Shell.tsx`
- Modify: `apps/admin-web/src/pages/AuditLogsPage.tsx`
- Modify: `apps/admin-web/src/pages/IssuesPage.tsx`
- Modify: `apps/admin-web/package.json`
- Modify: `services/api/package.json`

**Interfaces:**
- Produces: `MediaKind = "image" | "video" | "frame" | "map_source" | "map_tile"`。
- Produces: `MediaJobType = "frame_extract" | "tiff_tile"`。
- Produces: `MediaJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled"`。
- Produces: `AnnotationDocument` 与 `AnnotationItem` 的公共类型。

- [ ] **Step 1: 编写失败的共享类型导入测试**

Create `packages/media-contracts/src/index.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyAnnotationDocument } from "./index.js";

test("creates a versioned empty annotation document", () => {
  assert.deepEqual(createEmptyAnnotationDocument("media-1", 4000, 3000), {
    version: 1,
    mediaId: "media-1",
    imageWidth: 4000,
    imageHeight: 3000,
    annotations: [],
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm exec tsx --test packages/media-contracts/src/index.test.ts`

Expected: FAIL with `Cannot find module './index.js'`.

- [ ] **Step 3: 实现公共类型和空标注文档工厂**

Create `packages/media-contracts/src/index.ts`:

```ts
export type MediaKind = "image" | "video" | "frame" | "map_source" | "map_tile";
export type MediaJobType = "frame_extract" | "tiff_tile";
export type MediaJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AnnotationItem {
  id: string;
  type: "rect" | "arrow" | "text";
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: [number, number, number, number];
  text?: string;
  color: string;
  lineWidth: number;
  severity?: "low" | "medium" | "high";
  zIndex: number;
}

export interface AnnotationDocument {
  version: 1;
  mediaId: string;
  imageWidth: number;
  imageHeight: number;
  annotations: AnnotationItem[];
}

export function createEmptyAnnotationDocument(mediaId: string, imageWidth: number, imageHeight: number): AnnotationDocument {
  return { version: 1, mediaId, imageWidth, imageHeight, annotations: [] };
}
```

Update navigation labels to `待跟进线索` and `操作日志`; route paths stay `/issues` and `/audit-logs`.

- [ ] **Step 4: 运行共享类型测试与前端构建**

Run: `corepack pnpm exec tsx --test packages/media-contracts/src/index.test.ts`

Expected: PASS.

Run: `corepack pnpm --filter @xunjianbao/admin-web build`

Expected: exit code `0`.

- [ ] **Step 5: 提交任务**

```bash
git add packages/media-contracts apps/admin-web/src/components/Shell.tsx apps/admin-web/src/pages/AuditLogsPage.tsx apps/admin-web/src/pages/IssuesPage.tsx apps/admin-web/package.json services/api/package.json
git commit -m "feat: add shared media contracts and rename workflow labels"
```

## Task 2: 地图资产公共契约与 TIF 任务入队

**Files:**
- Create: `packages/map-core/package.json`
- Create: `packages/map-core/src/tiff-job.ts`
- Create: `packages/map-core/src/tiff-job.test.ts`
- Modify: `services/api/prisma/schema.prisma`
- Modify: `services/api/src/modules/map-assets/map-asset-upload.service.ts`
- Modify: `services/api/src/modules/map-assets/map-assets.controller.ts`
- Modify: `services/api/src/modules/map-assets/map-asset-upload.service.test.ts`

**Interfaces:**
- Produces: `TiffTileJobInput = { mapAssetId: string; sourcePath: string; outputDirectory: string; minZoom: number; maxZoom: number }`。
- Produces: `MapProcessingJob`，状态采用 `MediaJobStatus`。
- Consumes: 已有 `MapAsset` 和 `MapAssetUploadService.createFromUpload()`。

- [ ] **Step 1: 编写失败的 TIF 任务测试**

Create `packages/map-core/src/tiff-job.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { createTiffTileJob } from "./tiff-job.js";

test("builds an idempotent TIF tile job", () => {
  assert.deepEqual(createTiffTileJob("map-1", "storage/map-assets/map-1.tif"), {
    dedupeKey: "tiff_tile:map-1:v1",
    jobType: "tiff_tile",
    mapAssetId: "map-1",
    sourcePath: "storage/map-assets/map-1.tif",
    minZoom: 16,
    maxZoom: 19,
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm exec tsx --test packages/map-core/src/tiff-job.test.ts`

Expected: FAIL with `Cannot find module './tiff-job.js'`.

- [ ] **Step 3: 实现任务工厂和数据库模型**

Create `createTiffTileJob()`，固定使用 `tiff_tile:<mapAssetId>:v1` 作为幂等键。

Add Prisma model:

```prisma
model MediaProcessingJob {
  id          String   @id
  jobType     String
  status      String   @default("queued")
  dedupeKey   String   @unique
  inputJson   String
  outputJson  String?
  progress    Int      @default(0)
  errorMessage String?
  attempts    Int      @default(0)
  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

When a `.tif` or `.tiff` is uploaded, `MapAssetUploadService` creates the map asset and calls `mediaProcessingJob.upsert({ where: { dedupeKey }, create, update: {} })`; the asset remains `processStatus: "uploaded"` until worker completion.

- [ ] **Step 4: 增加 API 服务测试并验证通过**

Test that a TIF upload calls `upsert` once with `jobType: "tiff_tile"`, and a PNG upload never calls it.

Run: `corepack pnpm --filter @xunjianbao/api test`

Expected: PASS including prior map geometry tests and the new upload test.

- [ ] **Step 5: 提交任务**

```bash
git add packages/map-core services/api/prisma services/api/src/modules/map-assets
git commit -m "feat: queue TIF maps for tile processing"
```

## Task 3: 媒体处理 Worker 与地图瓦片生成

**Files:**
- Create: `services/media-worker/package.json`
- Create: `services/media-worker/tsconfig.json`
- Create: `services/media-worker/src/job-runner.ts`
- Create: `services/media-worker/src/gdal-tile-generator.ts`
- Create: `services/media-worker/src/gdal-tile-generator.test.ts`
- Create: `services/media-worker/src/main.ts`
- Modify: `services/api/Dockerfile`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `MediaProcessingJob` with `jobType: "tiff_tile"`.
- Produces: XYZ `z/x/y.png` files and `tile-metadata.json` in `storage/map-tiles/<mapAssetId>`.
- Produces: `MapAsset.tilePath`, `MapAsset.tileMetadata`, `MapAsset.processStatus = "ready"`.

- [ ] **Step 1: 编写失败的 GDAL 命令测试**

Create `services/media-worker/src/gdal-tile-generator.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildGdalTileCommand } from "./gdal-tile-generator.js";

test("generates XYZ tiles from a COG source", () => {
  assert.deepEqual(buildGdalTileCommand("source.tif", "tiles", 16, 19), {
    command: "gdal2tiles.py",
    args: ["--xyz", "--zoom=16-19", "--resampling=average", "source.tif", "tiles"],
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @xunjianbao/media-worker exec tsx --test src/gdal-tile-generator.test.ts`

Expected: FAIL because the worker package does not exist.

- [ ] **Step 3: 实现 GDAL 适配器和任务领取**

`buildGdalTileCommand()` returns the exact command above. `runTiffTileJob()` first executes:

```ts
await execFileAsync("gdal_translate", ["-of", "COG", "-co", "COMPRESS=ZSTD", sourcePath, cogPath]);
await execFileAsync(command, args);
```

`JobRunner.claimOne()` must claim one `queued` job in a transaction, update it to `running`, increment attempts and set `startedAt`. Completion updates progress to `100`, stores `outputJson`, updates the matching `MapAsset`, and records `map.tiles.ready`. Failure stores a readable `errorMessage` and sets `status: "failed"`.

- [ ] **Step 4: 安装运行依赖并验证命令参数测试**

Add package script:

```json
"scripts": { "dev": "tsx watch src/main.ts", "start": "tsx src/main.ts", "test": "tsx --test", "build": "tsc --noEmit" }
```

Install `ffmpeg` and `gdal` in the worker Docker image. Build the worker and run its unit test.

Run: `corepack pnpm --filter @xunjianbao/media-worker test`

Expected: PASS.

- [ ] **Step 5: 浏览器验收与提交**

1. 在“地图”上传一个 TIF。
2. 页面显示“处理中”。
3. Worker 完成后显示“可发布”。
4. 发布地图后首页通过 XYZ 地址加载新底图。

```bash
git add services/media-worker services/api/Dockerfile docker-compose.yml
git commit -m "feat: process TIF maps into reusable tile assets"
```

## Task 4: 视频抽帧数据模型与 FFmpeg 适配器

**Files:**
- Modify: `services/api/prisma/schema.prisma`
- Create: `services/api/src/modules/media/media.module.ts`
- Create: `services/api/src/modules/media/media.service.ts`
- Create: `services/api/src/modules/media/media.service.test.ts`
- Create: `services/media-worker/src/ffmpeg-frame-extractor.ts`
- Create: `services/media-worker/src/ffmpeg-frame-extractor.test.ts`
- Modify: `services/media-worker/src/job-runner.ts`

**Interfaces:**
- Produces: `MediaAsset` with `parentMediaId`, `videoTimestampMs` and `kind`.
- Produces: `POST /api/v1/media-jobs/frame-extraction`.
- Consumes: `MediaProcessingJob` with `jobType: "frame_extract"`.

- [ ] **Step 1: 编写失败的抽帧命令测试**

Create `services/media-worker/src/ffmpeg-frame-extractor.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildFrameExtractCommand } from "./ffmpeg-frame-extractor.js";

test("extracts one JPEG frame every three seconds", () => {
  assert.deepEqual(buildFrameExtractCommand("input.mp4", "frames/frame-%010d.jpg", 3), {
    command: "ffmpeg",
    args: ["-i", "input.mp4", "-vf", "fps=1/3", "-q:v", "2", "frames/frame-%010d.jpg"],
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @xunjianbao/media-worker exec tsx --test src/ffmpeg-frame-extractor.test.ts`

Expected: FAIL with `Cannot find module './ffmpeg-frame-extractor.js'`.

- [ ] **Step 3: 实现媒体表、任务创建和幂等帧写入**

Add Prisma models:

```prisma
model MediaAsset {
  id               String   @id
  kind             String
  originalFileName String
  storagePath      String
  mimeType         String
  fileSize         Int
  parentMediaId    String?
  videoTimestampMs Int?
  createdAt        DateTime @default(now())
  parentMedia      MediaAsset? @relation("MediaAssetFrames", fields: [parentMediaId], references: [id])
  frames           MediaAsset[] @relation("MediaAssetFrames")
  @@unique([parentMediaId, videoTimestampMs])
}
```

`MediaService.createFrameExtractionJob(videoId, intervalSeconds)` validates interval `2..5`, creates `frame_extract:<videoId>:<intervalSeconds>` and returns the persisted job. Worker uses `ffprobe` for duration, runs FFmpeg, then writes one child `MediaAsset` per actual frame timestamp.

- [ ] **Step 4: 编写媒体服务幂等性测试并验证通过**

Test that repeated `createFrameExtractionJob("media-video-1", 3)` returns the existing job and that interval `1` throws `2 至 5 秒`.

Run: `corepack pnpm --filter @xunjianbao/api test`

Expected: PASS.

Run: `corepack pnpm --filter @xunjianbao/media-worker test`

Expected: PASS.

- [ ] **Step 5: 提交任务**

```bash
git add services/api/prisma services/api/src/modules/media services/media-worker/src
git commit -m "feat: add offline video frame extraction"
```

## Task 5: 媒体库抽帧任务入口与状态呈现

**Files:**
- Create: `services/api/src/modules/media/media.controller.ts`
- Modify: `services/api/src/app.module.ts`
- Modify: `apps/admin-web/src/api/client.ts`
- Modify: `apps/admin-web/src/pages/MediaLibraryPage.tsx`
- Modify: `apps/admin-web/src/pages/media-library-detail.css`

**Interfaces:**
- Consumes: `POST /api/v1/media-jobs/frame-extraction { mediaId, intervalSeconds }`.
- Consumes: `GET /api/v1/media-jobs/:id`.
- Produces: 视频卡片的“抽帧分析”操作、进度条和失败重试按钮。

- [ ] **Step 1: 编写失败的 DTO 校验测试**

Create `services/api/src/modules/media/media.service.test.ts` case:

```ts
test("rejects a frame interval outside two to five seconds", async () => {
  await assert.rejects(() => service.createFrameExtractionJob("video-1", 6), /2 至 5 秒/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @xunjianbao/api test`

Expected: FAIL because controller and validation are not yet registered.

- [ ] **Step 3: 注册控制器并接入媒体库**

Controller methods:

```ts
@Post("media-jobs/frame-extraction")
createFrames(@Body() body: { mediaId?: string; intervalSeconds?: number }) {
  return ok(this.mediaService.createFrameExtractionJob(body.mediaId ?? "", body.intervalSeconds ?? 3));
}

@Get("media-jobs/:id")
detail(@Param("id") id: string) {
  return ok(this.mediaService.jobDetail(id));
}
```

In `MediaLibraryPage`, video cards render an interval selector with values `2`、`3`、`4`、`5`, a primary `开始抽帧` button, and persisted status. A failure state shows `重试` only when API status is `failed`.

- [ ] **Step 4: 运行 API 测试、前端构建和浏览器验收**

Run: `corepack pnpm --filter @xunjianbao/api test`

Run: `corepack pnpm --filter @xunjianbao/admin-web build`

Expected: both exit code `0`.

Browser acceptance: select one video, choose `3 秒`, click `开始抽帧`, refresh, and verify the same task status is still displayed.

- [ ] **Step 5: 提交任务**

```bash
git add services/api/src/modules/media services/api/src/app.module.ts apps/admin-web/src/api/client.ts apps/admin-web/src/pages/MediaLibraryPage.tsx apps/admin-web/src/pages/media-library-detail.css
git commit -m "feat: start frame extraction from media library"
```

## Task 6: 可复用照片标注编辑器

**Files:**
- Create: `packages/annotation-editor/package.json`
- Create: `packages/annotation-editor/tsconfig.json`
- Create: `packages/annotation-editor/src/annotation-document.ts`
- Create: `packages/annotation-editor/src/annotation-document.test.ts`
- Create: `packages/annotation-editor/src/AnnotationEditor.tsx`
- Create: `packages/annotation-editor/src/index.ts`
- Modify: `apps/admin-web/package.json`

**Interfaces:**
- Produces: `<AnnotationEditor mediaId imageUrl document onChange readOnly />`.
- Produces: `validateAnnotationDocument(document): AnnotationDocument`.
- Consumes: `AnnotationDocument` from `@xunjianbao/media-contracts`.

- [ ] **Step 1: 编写失败的标注坐标测试**

Create `packages/annotation-editor/src/annotation-document.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRect } from "./annotation-document.js";

test("clamps a rectangle to normalized image bounds", () => {
  assert.deepEqual(normalizeRect({ x: -0.1, y: 0.9, width: 0.4, height: 0.3 }), {
    x: 0,
    y: 0.7,
    width: 0.4,
    height: 0.3,
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @xunjianbao/annotation-editor exec tsx --test src/annotation-document.test.ts`

Expected: FAIL because package and function do not exist.

- [ ] **Step 3: 实现标注文档验证和编辑器组件**

`normalizeRect()` limits `x` and `y` to `0..1` and reduces width/height so `x + width <= 1` and `y + height <= 1`.

`packages/annotation-editor/package.json` 定义以下脚本：

```json
"scripts": { "test": "tsx --test", "build": "tsc --noEmit", "typecheck": "tsc --noEmit" }
```

`AnnotationEditor` owns selection and undo/redo history but not persistence:

```tsx
export function AnnotationEditor({ mediaId, imageUrl, document, onChange, readOnly = false }: AnnotationEditorProps) {
  return (
    <Stage width={canvasWidth} height={canvasHeight}>
      <Layer>
        <Image image={loadedImage} width={canvasWidth} height={canvasHeight} />
        {document.annotations.map(renderAnnotation)}
        {!readOnly ? <Transformer ref={transformerRef} /> : null}
      </Layer>
    </Stage>
  );
}
```

Use `react-konva` `Stage`, `Layer`, `Image`, `Rect`, `Arrow`, `Text` and `Transformer`. Drag and transform handlers convert rendered pixels back to normalized coordinates before calling `onChange`.

- [ ] **Step 4: 运行单元测试与包类型检查**

Run: `corepack pnpm --filter @xunjianbao/annotation-editor test`

Run: `corepack pnpm --filter @xunjianbao/annotation-editor build`

Expected: both exit code `0`.

- [ ] **Step 5: 提交任务**

```bash
git add packages/annotation-editor apps/admin-web/package.json pnpm-lock.yaml
git commit -m "feat: add reusable photo annotation editor"
```

## Task 7: 报告、线索与模块验收

**Files:**
- Modify: `apps/admin-web/src/pages/ReportWritePage.tsx`
- Modify: `apps/admin-web/src/pages/IssueDetailPage.tsx`
- Modify: `services/api/src/modules/reports/report-upload.service.ts`
- Modify: `services/api/src/modules/issues/issue-attachment.service.ts`
- Modify: `docs/开发阶段记录.md`

**Interfaces:**
- Consumes: `AnnotationEditor` and `AnnotationDocument`.
- Produces: 报告图片说明与标注文档的持久化记录；线索详情中的只读标注预览。

- [ ] **Step 1: 编写失败的报告标注序列化测试**

Add to `services/api/src/modules/reports/report-upload.service.test.ts`:

```ts
test("stores a versioned annotation document for report evidence", async () => {
  const stored = await service.saveAnnotationDocument("report-1", {
    version: 1,
    mediaId: "media-1",
    imageWidth: 1200,
    imageHeight: 800,
    annotations: [],
  });
  assert.equal(stored.mediaId, "media-1");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @xunjianbao/api test`

Expected: FAIL because `saveAnnotationDocument` does not exist.

- [ ] **Step 3: 接入报告和线索只读预览**

Replace the report page private rectangle/arrow/text rendering with `AnnotationEditor`. Persist JSON through `ReportUploadService.saveAnnotationDocument(reportId, document)` after DTO validation. In `IssueDetailPage`, render the same component with `readOnly` for linked evidence images.

- [ ] **Step 4: 全量验证与阶段记录**

Run: `corepack pnpm --filter @xunjianbao/api test`

Run: `corepack pnpm --filter @xunjianbao/admin-web build`

Run: `corepack pnpm --filter @xunjianbao/media-worker build`

Expected: all exit code `0`.

Browser acceptance:

1. 上传或选择一张媒体库图片。
2. 在报告页添加矩形、箭头和文字，切换图片后再返回。
3. 刷新页面后标注与图片说明仍存在。
4. 在待跟进线索详情打开同一证据，标注只读展示。
5. 在地图页发布已完成 TIF 处理的地图，原有小区、道路和重点点位跳转继续可用。

Record test output, commit IDs and known deployment prerequisites in `docs/开发阶段记录.md`.

- [ ] **Step 5: 提交任务**

```bash
git add apps/admin-web/src/pages/ReportWritePage.tsx apps/admin-web/src/pages/IssueDetailPage.tsx services/api/src/modules/reports services/api/src/modules/issues docs/开发阶段记录.md
git commit -m "feat: reuse annotations across reports and leads"
```

## Plan Self-Review

- Spec coverage: Task 1 covers public contracts and naming; Tasks 2-3 cover map source to lazy-loaded tiles; Tasks 4-5 cover offline frame extraction and media-library use; Tasks 6-7 cover reusable annotation and reuse in reports and leads.
- Task isolation: each task has its own interfaces, failure test, verification command and commit boundary.
- Type consistency: `MediaJobType`, `MediaJobStatus` and `AnnotationDocument` originate in `@xunjianbao/media-contracts`; API, worker and UI consume those names without alternate schemas.
- Scope control: YOLO, RTMP, live alerting, public npm publishing and COS implementation remain outside this plan.
