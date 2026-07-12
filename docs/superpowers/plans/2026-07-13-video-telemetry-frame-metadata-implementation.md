# MP4 遥测抽帧与历史回填 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让新 MP4 抽帧和既有 DJI M3TD 抽帧照片都拥有与视频时间点匹配的 GPS、时间、高度、云台角度、焦距和变焦遥测数据。

**Architecture:** 媒体工作进程新增一个深遥测解析模块，将 ffprobe 检测、SRT 导出、DJI 文本解析和最近时间匹配隐藏在两个接口后。`TaskPhoto` 保存常用位置字段，`TaskPhotoTelemetry` 保存完整遥测；抽帧和回填共用同一套匹配与 EXIF 写入模块。

**Tech Stack:** TypeScript 5、Node.js 24、FFmpeg/ffprobe、PostgreSQL、Prisma 7、NestJS 10、React 18、Ant Design 5、ExifTool CLI、Node `node:test`。

## Global Constraints

- 仅实现 MP4 遥测抽帧和历史回填，不接入 DJI Thermal SDK 或像素测温。
- 第一版只解析 `mov_text` DJI 字幕遥测轨，不解析 `djmd` 私有二进制协议。
- 匹配最大误差为 `250ms`，使用最近真实样本，不插值。
- 无遥测、部分损坏、单帧无匹配或 EXIF 失败不得让抽帧任务失败。
- 数据库是权威数据源；EXIF 是下载副本。
- 回填必须幂等，不重复生成照片或遥测记录。
- 当前 M3TD 视频首帧验收基准为 `31.229247, 121.634603`，相对高度约 `79.969m`。

---

## 文件结构

| 文件 | 责任 |
| --- | --- |
| `services/media-worker/src/video-telemetry.ts` | 遥测类型、SRT 文本解析、时间匹配。 |
| `services/media-worker/src/ffmpeg-video-telemetry.ts` | ffprobe 轨检测和 ffmpeg SRT 导出适配器。 |
| `services/media-worker/src/frame-exif-writer.ts` | ExifTool 命令构建与实际 EXIF 写入。 |
| `services/media-worker/src/frame-telemetry-enrichment.ts` | 将抽帧结果、遥测匹配和 EXIF 写入组合为单一接口。 |
| `services/media-worker/src/job-runner.ts` | 在现有抽帧任务中调用丰富模块并事务写库。 |
| `services/api/prisma/schema.prisma` | `TaskPhoto` 常用字段和 `TaskPhotoTelemetry` 一对一模型。 |
| `services/media-worker/src/telemetry-backfill.ts` | 按 media id 回填既有抽帧照片。 |
| `services/api/src/modules/inspection-tasks/task-photo-read.service.ts` | 返回照片遥测 DTO。 |
| `apps/admin-web/src/pages/ReportWritePage.tsx` | 显示遥测，为未手工编辑的标注自动带入坐标。 |

## Task 1: DJI 字幕遥测解析与时间匹配

**Files:**
- Create: `services/media-worker/src/video-telemetry.ts`
- Test: `services/media-worker/src/video-telemetry.test.ts`

**Interfaces:**
- Produces: `parseDjiTelemetrySrt(text): VideoTelemetryTrack` and `matchFrameTelemetry(frameTimestampMs, track, maxOffsetMs = 250): MatchedFrameTelemetry | null`.

- [ ] **Step 1: 写解析与匹配红灯测试**

```ts
test("parses DJI subtitle telemetry", () => {
  const track = parseDjiTelemetrySrt(`1\n00:00:00,000 --> 00:00:00,033\nFrameCnt: 0 2026-07-08 16:12:57.018\n[focal_len: 40.00] [dzoom_ratio: 1.00], [latitude: 31.229247] [longitude: 121.634603] [rel_alt: 79.969 abs_alt: 96.474] [gb_yaw: -67.6 gb_pitch: -30.0 gb_roll: 0.0]`);
  assert.equal(track.source, "dji_subtitle");
  assert.equal(track.samples[0].latitude, 31.229247);
  assert.equal(track.samples[0].absoluteAltitudeMeters, 96.474);
});

test("uses the nearest sample inside 250 milliseconds", () => {
  const matched = matchFrameTelemetry(3000, track);
  assert.equal(matched?.matchOffsetMs, 12);
});
```

- [ ] **Step 2: 运行确认 RED**

Run: `corepack pnpm --filter @xunjianbao/media-worker exec tsx --test src/video-telemetry.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `video-telemetry.js`.

- [ ] **Step 3: 实现解析和二分最近匹配**

```ts
export function matchFrameTelemetry(timestampMs: number, track: VideoTelemetryTrack, maxOffsetMs = 250) {
  const sample = nearestByTimestamp(track.samples, timestampMs);
  if (!sample || Math.abs(sample.timestampMs - timestampMs) > maxOffsetMs) return null;
  return { ...sample, matchOffsetMs: sample.timestampMs - timestampMs };
}
```

解析器使用显式正则分别提取时间、GPS、高度、云台、焦距和变焦。单条失败计入 `warnings`，不抛弃已解析样本。

- [ ] **Step 4: 验证并提交**

Run: `corepack pnpm --filter @xunjianbao/media-worker exec tsx --test src/video-telemetry.test.ts && corepack pnpm --filter @xunjianbao/media-worker build`

Expected: parser tests and typecheck PASS.

Commit: `git commit -m "feat(media): parse DJI video telemetry"`

## Task 2: FFmpeg 遥测轨适配器与无遥测降级

**Files:**
- Create: `services/media-worker/src/ffmpeg-video-telemetry.ts`
- Test: `services/media-worker/src/ffmpeg-video-telemetry.test.ts`

**Interfaces:**
- Consumes: Task 1 `parseDjiTelemetrySrt()`.
- Produces: `extractVideoTelemetry(videoPath): Promise<VideoTelemetryTrack>` and pure command builders.

- [ ] **Step 1: 写命令构建红灯测试**

```ts
test("selects the mov_text telemetry stream", () => {
  assert.deepEqual(buildTelemetryExtractCommand("flight.mp4", "/tmp/flight.srt", 2), {
    command: "ffmpeg",
    args: ["-v", "error", "-i", "flight.mp4", "-map", "0:2", "-y", "/tmp/flight.srt"],
  });
});
```

- [ ] **Step 2: 运行确认 RED**

Run: `corepack pnpm --filter @xunjianbao/media-worker exec tsx --test src/ffmpeg-video-telemetry.test.ts`

Expected: FAIL because adapter does not exist.

- [ ] **Step 3: 实现 ffprobe JSON 检测与临时 SRT 导出**

`extractVideoTelemetry()` 只选择 `codec_name=mov_text` 或 `handler_name` 包含 `Subtitle`的轨。无轨时返回 `{ source: "none", samples: [], warnings: [] }`。临时文件在 `finally` 中删除。

- [ ] **Step 4: 验证并提交**

Run: `corepack pnpm --filter @xunjianbao/media-worker exec tsx --test src/ffmpeg-video-telemetry.test.ts && corepack pnpm --filter @xunjianbao/media-worker build`

Expected: adapter tests and typecheck PASS.

Commit: `git commit -m "feat(media): extract video telemetry track"`

## Task 3: 数据库遥测模型

**Files:**
- Modify: `services/api/prisma/schema.prisma`
- Create: `services/api/prisma/migrations/<timestamp>_task_photo_telemetry/migration.sql`
- Test: `services/api/prisma/task-photo-telemetry-schema.test.ts`

**Interfaces:**
- Produces: `TaskPhoto.latitude`, `longitude`, `absoluteAltitudeMeters`, `relativeAltitudeMeters` and one-to-one `TaskPhotoTelemetry`.

- [ ] **Step 1: 写 schema 红灯测试**

```ts
test("defines one telemetry record per task photo", async () => {
  const schema = await readFile(new URL("./schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /model TaskPhotoTelemetry\s*\{/);
  assert.match(schema, /taskPhotoId\s+String\s+@unique/);
  assert.match(schema, /gimbalPitchDegrees\s+Float\?/);
});
```

- [ ] **Step 2: 运行确认 RED**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test prisma/task-photo-telemetry-schema.test.ts`

Expected: FAIL because telemetry model is absent.

- [ ] **Step 3: 实现 schema 与 PostgreSQL 迁移**

`TaskPhotoTelemetry.taskPhotoId` 加 `@unique`并使用 `onDelete: Cascade`。`TaskPhoto` 上的 GPS 与高度字段可空，以兼容无遥测照片。

- [ ] **Step 4: 生成 Prisma Client、运行测试并提交**

Run: `corepack pnpm --filter @xunjianbao/api db:generate && corepack pnpm --filter @xunjianbao/api exec tsx --test prisma/task-photo-telemetry-schema.test.ts && corepack pnpm --filter @xunjianbao/api build`

Expected: generation, schema test and typecheck PASS.

Commit: `git commit -m "feat(media): add task photo telemetry schema"`

## Task 4: EXIF 写入与抽帧流程接入

**Files:**
- Create: `services/media-worker/src/frame-exif-writer.ts`
- Test: `services/media-worker/src/frame-exif-writer.test.ts`
- Create: `services/media-worker/src/frame-telemetry-enrichment.ts`
- Test: `services/media-worker/src/frame-telemetry-enrichment.test.ts`
- Modify: `services/media-worker/src/job-runner.ts`
- Modify: `services/media-worker/src/job-runner.test.ts`
- Modify: `services/media-worker/Dockerfile`

**Interfaces:**
- Consumes: extracted frames, Task 1 matcher and Task 2 telemetry track.
- Produces: `enrichExtractedFrames(videoPath, frames): Promise<EnrichedFrameResult>`.

- [ ] **Step 1: 写 EXIF 命令红灯测试**

```ts
test("writes GPS time altitude focal length and DJI comment", () => {
  const args = buildExifToolArgs("frame.jpg", matchedTelemetry);
  assert.ok(args.includes("-GPSLatitude=31.229247"));
  assert.ok(args.includes("-GPSLongitude=121.634603"));
  assert.ok(args.some((item) => item.startsWith("-DateTimeOriginal=")));
  assert.ok(args.includes("-FocalLength=40"));
});
```

- [ ] **Step 2: 运行确认 RED**

Run: `corepack pnpm --filter @xunjianbao/media-worker exec tsx --test src/frame-exif-writer.test.ts`

Expected: FAIL because EXIF writer does not exist.

- [ ] **Step 3: 实现 ExifTool 适配器和丰富模块**

ExifTool 命令必须包含 `-overwrite_original`。丰富模块并发获取遥测轨，逐帧匹配并以有限并发写 EXIF，返回匹配、未匹配、EXIF 成功和失败统计。

- [ ] **Step 4: 修改 job runner 事务写入**

`processFrameJob()` 在生成 frame rows 前调用 `enrichExtractedFrames()`。`taskPhoto.createMany` 写常用字段，随后在同一事务中对匹配照片调用 `taskPhotoTelemetry.upsert`。`outputJson` 写入完整统计。

- [ ] **Step 5: 安装 ExifTool 运行时并验证**

macOS 开发环境使用已安装 `exiftool`；Dockerfile 在 Debian 中安装 `libimage-exiftool-perl`。

Run: `corepack pnpm --filter @xunjianbao/media-worker test && corepack pnpm --filter @xunjianbao/media-worker build`

Expected: all worker tests and typecheck PASS.

Commit: `git commit -m "feat(media): preserve telemetry during frame extraction"`

## Task 5: 幂等历史回填命令

**Files:**
- Create: `services/media-worker/src/telemetry-backfill.ts`
- Create: `services/media-worker/src/telemetry-backfill.test.ts`
- Modify: `services/media-worker/package.json`

**Interfaces:**
- Consumes: `enrichExtractedFrames()` and Prisma telemetry model.
- Produces: CLI `pnpm telemetry:backfill --media-id <id>` and `backfillMediaTelemetry(mediaId)`.

- [ ] **Step 1: 写幂等回填红灯测试**

```ts
test("upserts telemetry without creating frames or task photos", async () => {
  const result = await backfillMediaTelemetry("media-1", dependencies);
  assert.equal(result.updated, 2);
  assert.equal(calls.mediaAssetCreate.length, 0);
  assert.equal(calls.taskPhotoTelemetryUpsert.length, 2);
});
```

- [ ] **Step 2: 运行确认 RED**

Run: `corepack pnpm --filter @xunjianbao/media-worker exec tsx --test src/telemetry-backfill.test.ts`

Expected: FAIL because backfill module does not exist.

- [ ] **Step 3: 实现回填与 CLI 参数校验**

CLI 只接受 `--media-id`。检查原视频、子 frame 和 `TaskPhoto` 关系，然后调用共享丰富模块并 upsert。没有原视频或无遥测时非零退出并显示中文原因。

- [ ] **Step 4: 测试并提交**

Run: `corepack pnpm --filter @xunjianbao/media-worker exec tsx --test src/telemetry-backfill.test.ts && corepack pnpm --filter @xunjianbao/media-worker build`

Expected: backfill tests and typecheck PASS.

Commit: `git commit -m "feat(media): backfill video frame telemetry"`

## Task 6: API 读取与报告页展示

**Files:**
- Modify: `services/api/src/modules/inspection-tasks/task-photo-read.service.ts`
- Modify: `services/api/src/modules/inspection-tasks/task-photo-read.service.test.ts`
- Modify: `apps/admin-web/src/pages/report-media-adapter.ts`
- Modify: `apps/admin-web/src/pages/report-media-adapter.test.ts`
- Modify: `apps/admin-web/src/pages/ReportWritePage.tsx`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Consumes: TaskPhoto and TaskPhotoTelemetry.
- Produces: task photo DTO `telemetry` and automatic report photo metadata display.

- [ ] **Step 1: 扩展 API 红灯测试**

```ts
test("returns full telemetry with a task photo", async () => {
  const result = await service.listTaskPhotos("task-1");
  assert.equal(result.items[0].telemetry.gimbalPitchDegrees, -30);
  assert.equal(result.items[0].latitude, 31.229247);
});
```

- [ ] **Step 2: 运行确认 RED，实现 API include 与 DTO**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/inspection-tasks/task-photo-read.service.test.ts`

Expected: FAIL because telemetry is not returned. Add Prisma `include: { telemetry: true }` and explicit DTO mapping, then rerun to PASS.

- [ ] **Step 3: 扩展前端适配红灯测试**

```ts
test("maps telemetry into report photo metadata", () => {
  const photo = toReportPhoto(assetWithTelemetry, 1, "/content");
  assert.equal(photo.latitude, 31.229247);
  assert.equal(photo.gimbalPitchDegrees, -30);
});
```

- [ ] **Step 4: 实现页面展示与自动坐标**

照片信息面板新增拍摄时间、GPS、相对／海拔高度、云台角度、焦距和变焦。只在该照片没有已保存的手工标注坐标时，自动带入遥测 GPS 和海拔高度。

- [ ] **Step 5: 验证并提交**

Run: `corepack pnpm --filter @xunjianbao/api test && corepack pnpm --filter @xunjianbao/admin-web build`

Expected: API tests and frontend production build PASS.

Commit: `git commit -m "feat(report): display frame telemetry metadata"`

## Task 7: 当前视频回填、真实验收与模块锁定

**Files:**
- Modify: `docs/开发阶段记录.md`
- Modify: `docs/巡检宝功能模块清单.md`

- [ ] **Step 1: 应用数据库迁移**

Run: `corepack pnpm --filter @xunjianbao/api db:deploy`

Expected: telemetry migration applied successfully.

- [ ] **Step 2: 回填当前视频**

Run: `corepack pnpm --filter @xunjianbao/media-worker telemetry:backfill --media-id media-baea0035-73e9-4223-94ce-6f35ed234ce0`

Expected: existing frames updated; no media assets or task photos created.

- [ ] **Step 3: 抽样核对数据库与 EXIF**

Run: `exiftool -GPSLatitude -GPSLongitude -GPSAltitude -DateTimeOriginal -FocalLength services/api/storage/media/frames/media-baea0035-73e9-4223-94ce-6f35ed234ce0/frame-0000000001.jpg`

Expected: first frame is near `31.229247, 121.634603`, altitude near `96.474m`, focal length `40mm`.

- [ ] **Step 4: 浏览器验收**

打开当前任务报告编写页，确认第一张抽帧照片显示 GPS、时间、高度、云台和焦距，地图二维码可用。

- [ ] **Step 5: 完整回归**

Run: `corepack pnpm --filter @xunjianbao/media-worker test && corepack pnpm --filter @xunjianbao/api test && corepack pnpm --filter @xunjianbao/api build && corepack pnpm --filter @xunjianbao/admin-web build && git diff --check`

Expected: all tests, typechecks, builds and whitespace check PASS.

- [ ] **Step 6: 更新阶段记录并提交**

记录回填数量、匹配数量、EXIF 成功／失败、首帧抽样值、浏览器验收和模块边界。

Commit: `git commit -m "docs: lock video frame telemetry module"`
