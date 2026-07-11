# Unified Media Task Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified media task workflow where MP4/MOV videos and image ZIP archives are processed into previewable child assets, video cards play on hover, and any extracted image can open directly in the report annotation page.

**Architecture:** Keep `MediaAsset` as the parent/child media graph and `MediaProcessingJob` as the durable queue. The NestJS API accepts and serves assets, while `media-worker` performs FFmpeg frame extraction and safe ZIP extraction. The React admin app consumes task/child endpoints and passes a selected child `mediaId` into the existing report writer.

**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL, React 18, Ant Design, FFmpeg, `yauzl`, Node test runner, Vite.

## Global Constraints

- MP4, MOV and ZIP are the only accepted top-level upload formats.
- ZIP children are flattened and only JPG, JPEG and PNG are extracted.
- ZIP limits: 2 GB compressed, 1000 images, 8 GB expanded, 50 MB per image.
- Reject absolute paths, traversal entries, symlinks and encrypted ZIP files.
- Video preview must use authenticated HTTP Range responses and only load the hovered card.
- The report handoff is one image at a time through `/reports/write?mediaId=<id>`.
- Keep `GET /media-assets/videos` for one compatibility cycle.
- Do not change existing annotation, report submission or AI review behavior.

---

### Task 1: Unified media task API

**Files:**
- Modify: `services/api/src/modules/media/media.service.test.ts`
- Modify: `services/api/src/modules/media/media.service.ts`
- Modify: `services/api/src/modules/media/media.controller.ts`

**Interfaces:**
- Consumes: existing `MediaAsset`, `MediaProcessingJob`, `UploadedFileLike`.
- Produces: `createMediaFromUpload(file, intervalSeconds)`, `listTasks()`, `listChildren(parentId)`, `getAsset(id)`, and compatibility `listVideos()`.

- [ ] **Step 1: Write failing tests for ZIP upload and unified task listing**

```ts
test("stores an uploaded ZIP and queues archive extraction", async () => {
  const result = await service.createMediaFromUpload(zipFile, 3);
  assert.equal(result.asset.kind, "image_bundle");
  assert.equal(jobCreates[0].create.jobType, "archive_extract");
});

test("lists only top-level media tasks with their latest job", async () => {
  await service.listTasks();
  assert.deepEqual(findManyCalls[0].where, {
    parentMediaId: null,
    kind: { in: ["video", "image_bundle"] },
  });
});

test("lists ordered child assets for a media task", async () => {
  await service.listChildren("media-parent-1");
  assert.equal(findManyCalls[0].where.parentMediaId, "media-parent-1");
});

test("returns one persisted media asset", async () => {
  const asset = await service.getAsset("frame-1");
  assert.equal(asset.id, "frame-1");
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/media/media.service.test.ts`  
Expected: FAIL because `createMediaFromUpload`, `listTasks`, `listChildren`, and `getAsset` do not exist.

- [ ] **Step 3: Implement file-type dispatch and durable archive job creation**

```ts
async createMediaFromUpload(file: UploadedFileLike | undefined, intervalSeconds: number) {
  if (!file) throw new BadRequestException("请选择要上传的素材");
  const extension = extname(file.originalname).toLowerCase();
  if (extension === ".mp4" || extension === ".mov") {
    return this.createVideoFromUpload(file, intervalSeconds);
  }
  if (extension === ".zip") {
    return this.createArchiveFromUpload(file);
  }
  await rm(file.path, { force: true });
  throw new BadRequestException("仅支持 MP4、MOV 或 ZIP 文件");
}

private queueArchiveExtraction(media: { id: string; storagePath: string }) {
  return this.database.mediaProcessingJob.upsert({
    where: { dedupeKey: `archive_extract:${media.id}` },
    create: {
      id: `job-archive-${media.id}`,
      jobType: "archive_extract",
      status: "queued",
      dedupeKey: `archive_extract:${media.id}`,
      mediaId: media.id,
      inputJson: JSON.stringify({ mediaId: media.id, sourcePath: media.storagePath }),
    },
    update: {},
  });
}
```

Implement `listTasks()` with latest job include, `listChildren()` ordered by `videoTimestampMs`, then `createdAt`, and `getAsset()` with a `NotFoundException` for unknown IDs. Update retry validation to accept both `frame_extract` and `archive_extract`.

- [ ] **Step 4: Expose unified routes while retaining compatibility**

```ts
@Post("media-assets/upload")
async upload(@UploadedFile() file: UploadedFileLike | undefined, @Body() body: { intervalSeconds?: string }) {
  return ok(await this.mediaService.createMediaFromUpload(file, Number(body.intervalSeconds ?? 3)));
}

@Get("media-assets/tasks")
async tasks() { return ok(await this.mediaService.listTasks()); }

@Get("media-assets/:id/children")
async children(@Param("id") id: string) { return ok(await this.mediaService.listChildren(id)); }

@Get("media-assets/:id")
async asset(@Param("id") id: string) { return ok(await this.mediaService.getAsset(id)); }
```

- [ ] **Step 5: Run API tests**

Run: `corepack pnpm --filter @xunjianbao/api test`  
Expected: all API tests PASS.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/modules/media
git commit -m "feat: unify media upload tasks"
```

---

### Task 2: Safe ZIP image extraction worker

**Files:**
- Modify: `services/media-worker/package.json`
- Create: `services/media-worker/src/archive-image-extractor.ts`
- Create: `services/media-worker/src/archive-image-extractor.test.ts`
- Modify: `services/media-worker/src/job-runner.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `{ mediaId, sourcePath }` archive job input.
- Produces: `extractArchiveImages(inputPath, outputDirectory, limits): Promise<ExtractedArchiveImage[]>` and child `MediaAsset(kind="image")` rows.

- [ ] **Step 1: Add `yauzl` and its TypeScript declarations**

Run: `corepack pnpm --filter @xunjianbao/media-worker add yauzl && corepack pnpm --filter @xunjianbao/media-worker add -D @types/yauzl`  
Expected: worker manifest and lockfile contain `yauzl`.

- [ ] **Step 2: Write failing extraction and security tests**

```ts
test("flattens nested JPG and PNG entries", async () => {
  const images = await extractArchiveImages(fixtureZip, output, defaultArchiveLimits);
  assert.deepEqual(images.map((item) => item.fileName), ["a.jpg", "b.png"]);
});

test("rejects path traversal entries", async () => {
  await assert.rejects(
    () => extractArchiveImages(traversalZip, output, defaultArchiveLimits),
    /路径无效/,
  );
});

test("rejects a file whose signature does not match its image extension", async () => {
  await assert.rejects(() => extractArchiveImages(fakeJpegZip, output, defaultArchiveLimits), /图片格式无效/);
});
```

- [ ] **Step 3: Run extractor tests and verify they fail**

Run: `corepack pnpm --filter @xunjianbao/media-worker exec tsx --test src/archive-image-extractor.test.ts`  
Expected: FAIL because the extractor module does not exist.

- [ ] **Step 4: Implement lazy, bounded ZIP extraction**

```ts
export const defaultArchiveLimits = {
  maxImages: 1000,
  maxExpandedBytes: 8 * 1024 ** 3,
  maxFileBytes: 50 * 1024 ** 2,
};

export interface ExtractedArchiveImage {
  fileName: string;
  storagePath: string;
  mimeType: "image/jpeg" | "image/png";
  fileSize: number;
  sortIndex: number;
}

export async function extractArchiveImages(
  inputPath: string,
  outputDirectory: string,
  limits = defaultArchiveLimits,
): Promise<ExtractedArchiveImage[]> {
  await mkdir(outputDirectory, { recursive: true });
  return openArchiveLazily(inputPath, async (archive) => {
    const result: ExtractedArchiveImage[] = [];
    let expandedBytes = 0;
    for await (const entry of archiveEntries(archive)) {
      validateSafeEntry(entry);
      if (!isSupportedImageName(entry.fileName)) continue;
      if (result.length >= limits.maxImages) throw new Error("图片数量超过 1000 张");
      if (entry.uncompressedSize > limits.maxFileBytes) throw new Error("单张图片超过 50 MB");
      expandedBytes += entry.uncompressedSize;
      if (expandedBytes > limits.maxExpandedBytes) throw new Error("解压后文件总量超过 8 GB");
      result.push(await extractValidatedImage(archive, entry, outputDirectory, result.length));
    }
    if (!result.length) throw new Error("压缩包中没有有效的 JPG、JPEG 或 PNG 图片");
    return result;
  }).catch(async (error) => {
    await rm(outputDirectory, { recursive: true, force: true });
    throw error;
  });
}
```

Open with `yauzl.open(..., { lazyEntries: true, decodeStrings: true })`. Validate entry names before opening streams, skip directories and unsupported extensions, reject encrypted/symlink entries, enforce declared and streamed byte limits, inspect JPEG/PNG magic bytes, assign collision-safe flat names, and remove partial output on failure.

- [ ] **Step 5: Dispatch `archive_extract` in `JobRunner`**

```ts
if (job.jobType === "tiff_tile") await this.processTiffJob(job.id, job.inputJson);
else if (job.jobType === "frame_extract") await this.processFrameJob(job.id, job.inputJson);
else if (job.jobType === "archive_extract") await this.processArchiveJob(job.id, job.inputJson);
else throw new Error(`不支持的媒体任务类型：${job.jobType}`);
```

`processArchiveJob()` writes child media assets with `kind: "image"`, completes the job with `{ imageCount, skippedCount, imageDirectory }`, and adds `media.archive.ready` to `AuditLog`.

- [ ] **Step 6: Run worker tests and build**

Run: `corepack pnpm --filter @xunjianbao/media-worker test && corepack pnpm --filter @xunjianbao/media-worker build`  
Expected: all worker tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit**

```bash
git add services/media-worker pnpm-lock.yaml
git commit -m "feat: extract image archives safely"
```

---

### Task 3: Authenticated media content and HTTP Range

**Files:**
- Create: `services/api/src/modules/media/media-content.service.ts`
- Create: `services/api/src/modules/media/media-content.service.test.ts`
- Modify: `services/api/src/modules/media/media.controller.ts`
- Modify: `services/api/src/modules/media/media.module.ts`

**Interfaces:**
- Consumes: a `MediaAsset.storagePath`, optional HTTP `Range` header.
- Produces: `resolveContent(id, rangeHeader): Promise<MediaContentResponse>` with status, headers and readable file stream.

- [ ] **Step 1: Write failing tests for complete image and partial video responses**

```ts
test("returns a full image response", async () => {
  const result = await service.resolveContent("image-1", undefined);
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["Content-Type"], "image/jpeg");
});

test("returns a byte range for video preview", async () => {
  const result = await service.resolveContent("video-1", "bytes=0-99");
  assert.equal(result.statusCode, 206);
  assert.equal(result.headers["Content-Range"], "bytes 0-99/1000");
  assert.equal(result.headers["Accept-Ranges"], "bytes");
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/media/media-content.service.test.ts`  
Expected: FAIL because `MediaContentService` does not exist.

- [ ] **Step 3: Implement storage-bound path validation and Range parsing**

```ts
export interface MediaContentResponse {
  statusCode: 200 | 206;
  headers: Record<string, string | number>;
  stream: ReadStream;
}

export function parseByteRange(header: string | undefined, fileSize: number) {
  if (!header) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(header);
  if (!match) throw new RangeNotSatisfiableException();
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), fileSize - 1) : fileSize - 1;
  if (start > end || start >= fileSize) throw new RangeNotSatisfiableException();
  return { start, end, length: end - start + 1 };
}
```

Resolve only paths inside `services/api/storage`, reject missing assets/files, accept one `bytes=start-end` range, clamp the end to file size, and return 416 for invalid or unsatisfiable ranges.

- [ ] **Step 4: Stream from the controller**

```ts
@Get("media-assets/:id/content")
async content(@Param("id") id: string, @Headers("range") range: string | undefined, @Res() response: Response) {
  const content = await this.mediaContentService.resolveContent(id, range);
  response.status(content.statusCode);
  Object.entries(content.headers).forEach(([name, value]) => response.setHeader(name, value));
  content.stream.pipe(response);
}
```

- [ ] **Step 5: Run API tests and build**

Run: `corepack pnpm --filter @xunjianbao/api test && corepack pnpm --filter @xunjianbao/api build`  
Expected: all API tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/modules/media
git commit -m "feat: stream authenticated media content"
```

---

### Task 4: Unified task adapter, upload copy and hover preview

**Files:**
- Replace: `apps/admin-web/src/pages/media-task-adapter.ts`
- Modify: `apps/admin-web/src/pages/media-task-adapter.test.ts`
- Create: `apps/admin-web/src/components/MediaTaskPreview.tsx`
- Modify: `apps/admin-web/src/pages/MediaLibraryPage.tsx`
- Modify: `apps/admin-web/src/pages/media-library-detail.css`

**Interfaces:**
- Consumes: unified `/media-assets/tasks` records and `getApiUrl('/media-assets/:id/content')`.
- Produces: `MediaTaskViewModel` with `assetKind`, `assetCount`, `contentUrl`, `posterUrl`, and localized status.

- [ ] **Step 1: Write failing adapter tests for video and image bundle tasks**

```ts
test("maps an image bundle to a unified task", () => {
  const task = toMediaTaskViewModel(bundleRecord);
  assert.equal(task.assetKind, "image_bundle");
  assert.equal(task.kindLabel, "图片包");
  assert.equal(task.assetCount, 18);
});
```

- [ ] **Step 2: Run adapter tests and verify they fail**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/media-task-adapter.test.ts`  
Expected: FAIL because the unified mapper is missing.

- [ ] **Step 3: Implement unified mapping and wording**

```ts
export interface MediaTaskViewModel {
  id: string;
  assetKind: "video" | "image_bundle";
  kindLabel: "视频" | "图片包";
  originalFileName: string;
  status: TaskStatus;
  progress: number;
  assetCount: number;
  contentUrl: string;
  posterUrl?: string;
  jobId?: string | null;
  errorMessage?: string | null;
}
```

Change visible copy from “视频任务” to “任务”, “视频任务数” to “任务数”, and “上传视频” to “上传素材”. The file input accepts `.mp4,.mov,.zip`.

- [ ] **Step 4: Add a hover-only video preview component**

```tsx
export function MediaTaskPreview({ task }: { task: MediaTaskViewModel }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);
  if (task.assetKind !== "video") return <img src={task.posterUrl} alt={task.originalFileName} />;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        const video = videoRef.current;
        if (video) {
          video.pause();
          video.currentTime = 0;
        }
        setHovered(false);
      }}
    >
      {hovered
        ? <video ref={videoRef} autoPlay muted playsInline preload="metadata" poster={task.posterUrl} src={task.contentUrl} />
        : <img src={task.posterUrl} alt={task.originalFileName} />}
    </div>
  );
}
```

Render only the selected or hovered video element and keep a poster fallback. Stop click propagation from the play control so selecting a task remains predictable.

- [ ] **Step 5: Run frontend tests and build**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/media-task-adapter.test.ts && corepack pnpm --filter @xunjianbao/admin-web build`  
Expected: tests PASS and Vite build exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/pages apps/admin-web/src/components
git commit -m "feat: preview unified media tasks"
```

---

### Task 5: Child asset gallery and report handoff

**Files:**
- Create: `apps/admin-web/src/components/MediaAssetGallery.tsx`
- Create: `apps/admin-web/src/components/media-asset-presenter.ts`
- Create: `apps/admin-web/src/components/media-asset-presenter.test.ts`
- Modify: `apps/admin-web/src/pages/MediaLibraryPage.tsx`
- Modify: `apps/admin-web/src/pages/ReportWritePage.tsx`
- Create: `apps/admin-web/src/pages/report-media-adapter.ts`
- Create: `apps/admin-web/src/pages/report-media-adapter.test.ts`
- Modify: `apps/admin-web/src/pages/media-library-detail.css`

**Interfaces:**
- Consumes: `GET /media-assets/:id/children`, `GET /media-assets/:id/content`, query `mediaId`.
- Produces: a task-scoped image grid and a report `PhotoItem` created from a persisted media asset.

- [ ] **Step 1: Write failing tests for gallery labels and report media mapping**

```ts
test("uses video timestamp for frame captions", () => {
  assert.equal(formatMediaCaption({ kind: "frame", videoTimestampMs: 6000 }), "00:06");
});

test("maps a media asset into a report photo", () => {
  const photo = toReportPhoto(asset, 1, "/api/v1/media-assets/frame-1/content?token=test");
  assert.equal(photo.fileName, "frame-0000000003.jpg");
  assert.match(photo.url, /media-assets\/frame-1\/content/);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/report-media-adapter.test.ts ../../apps/admin-web/src/components/media-asset-presenter.test.ts`  
Expected: FAIL because the adapters/components do not exist.

- [ ] **Step 3: Implement the selected-task asset query and gallery**

```tsx
<MediaAssetGallery
  loading={childrenLoading}
  assets={selectedTaskChildren}
  onPreview={setPreviewAsset}
  onWriteReport={(asset) => navigate(`/reports/write?mediaId=${encodeURIComponent(asset.id)}`)}
/>
```

The gallery appears below the task list, uses a stable aspect ratio, displays timestamps for `frame` and filenames for `image`, and has loading, processing, failed and empty states.

- [ ] **Step 4: Load persisted media in `ReportWritePage`**

```ts
const [searchParams] = useSearchParams();
const sourceMediaId = searchParams.get("mediaId");

useEffect(() => {
  if (!sourceMediaId) return;
  void getApi<MediaAssetRecord>(`/media-assets/${sourceMediaId}`)
    .then((asset) => {
      const contentUrl = getApiUrl(`/media-assets/${asset.id}/content`);
      const photo = toReportPhoto(asset, nextPhotoIdRef.current++, contentUrl);
      setPhotos((current) => [photo, ...current.filter((item) => item.url !== photo.url)]);
      setActivePhotoId(photo.id);
    })
    .catch(() => message.error("素材读取失败，可继续手工上传图片"));
}, [sourceMediaId]);
```

Use the `GET /media-assets/:id` contract from Task 1 so the report page remains independent from the task list state.

- [ ] **Step 5: Run frontend tests and build**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/report-media-adapter.test.ts ../../apps/admin-web/src/components/media-asset-presenter.test.ts && corepack pnpm --filter @xunjianbao/admin-web build`  
Expected: tests PASS and Vite build exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/components apps/admin-web/src/pages
git commit -m "feat: open media assets in report writer"
```

---

### Task 6: Real-file integration, browser acceptance and documentation

**Files:**
- Modify: `docs/开发阶段记录.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed API, worker and frontend tasks.
- Produces: verified end-to-end behavior and operational documentation.

- [ ] **Step 1: Apply schema/client updates and run full automated verification**

Run:

```bash
corepack pnpm db:generate
corepack pnpm db:deploy
corepack pnpm --filter @xunjianbao/api test
corepack pnpm --filter @xunjianbao/media-worker test
corepack pnpm build
git diff --check
```

Expected: all tests PASS, build exits 0, database is current, and diff check is clean.

- [ ] **Step 2: Create controlled MP4 and ZIP fixtures outside the repository**

```bash
ffmpeg -f lavfi -i testsrc=size=640x360:rate=10 -t 8 -pix_fmt yuv420p /tmp/xunjianbao-preview.mp4
```

Create `/tmp/xunjianbao-images.zip` with nested JPG/PNG files, one ignored text file, and duplicate basenames. Do not commit generated media.

- [ ] **Step 3: Browser acceptance**

Verify at `http://127.0.0.1:5181/media-library`:

- “任务”“任务数”“上传素材” wording is visible.
- MP4 upload completes, hover starts muted preview, mouse leave stops it.
- Extracted frames appear below the selected task.
- ZIP upload completes and nested images are flattened into one gallery.
- Clicking “写报告” opens `/reports/write?mediaId=...` and the image is active in the annotation canvas.
- Invalid ZIP shows a failed task with a readable reason and retry control.
- Console has no errors at desktop and narrow viewport sizes.

- [ ] **Step 4: Clean temporary test data and record the module**

Remove only the controlled fixtures and records created during this task. Append the final endpoints, commands, test counts and browser acceptance results to `docs/开发阶段记录.md`; update README upload wording and worker dependency.

- [ ] **Step 5: Commit and push**

```bash
git add README.md docs/开发阶段记录.md
git commit -m "docs: record unified media task workflow"
git push origin codex/real-workflow-v1
```
