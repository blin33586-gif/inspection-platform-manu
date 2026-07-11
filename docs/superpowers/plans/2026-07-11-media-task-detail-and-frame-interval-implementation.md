# Media Task Detail and Frame Interval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 1-5 second video frame interval selection and move persisted task media previews from the media-library list into a dedicated task detail page.

**Architecture:** Keep `/media-library` responsible for upload, filtering, task summaries, and demo-event review. Persisted task cards navigate to `/media-library/:taskId`; the detail page reads one task plus its child assets and reuses `MediaAssetGallery`. Existing media tables and processing job formats remain unchanged.

**Tech Stack:** React 18, React Router, Ant Design, NestJS, Prisma/PostgreSQL, FFmpeg worker, Node test runner, TypeScript.

## Global Constraints

- Video interval options are exactly 1, 2, 3, 4, and 5 seconds; default is 3 seconds.
- ZIP uploads ignore the interval value.
- The task detail is an in-app route, not a new browser tab.
- Existing upload, archive extraction, media authentication, Range streaming, and report annotation behavior must remain compatible.
- No AI detection, event merge, or report-editor annotation changes are included.

---

### Task 1: Accept One-to-Five-Second Frame Intervals

**Files:**
- Modify: `services/api/src/modules/media/media.service.test.ts`
- Modify: `services/api/src/modules/media/media.service.ts`
- Modify: `services/media-worker/src/ffmpeg-frame-extractor.test.ts`
- Modify: `services/media-worker/src/job-runner.test.ts`
- Modify: `services/media-worker/src/job-runner.ts`

**Interfaces:**
- Consumes: `MediaService.createFrameExtractionJob(mediaId, intervalSeconds)` and worker `FrameExtractionJobInput.intervalSeconds`.
- Produces: validation accepting integer seconds from 1 through 5 and rejecting values outside that range.

- [ ] **Step 1: Write failing API and worker tests**

Add assertions equivalent to:

```ts
await service.createFrameExtractionJob("media-video-1", 1);
await service.createFrameExtractionJob("media-video-1", 5);
await assert.rejects(() => service.createFrameExtractionJob("media-video-1", 0), /1 至 5 秒/);
await assert.rejects(() => service.createFrameExtractionJob("media-video-1", 6), /1 至 5 秒/);

assert.deepEqual(buildFrameExtractCommand("input.mp4", "frames/frame-%010d.jpg", 1).args, [
  "-i", "input.mp4", "-vf", "fps=1/1", "-q:v", "2", "frames/frame-%010d.jpg",
]);
```

Add a worker input test that processes a `frame_extract` job with `intervalSeconds: 1` through a supplied frame-extraction handler or exported parser boundary and confirms it is accepted.

- [ ] **Step 2: Run tests and verify the new boundary fails**

Run:

```bash
corepack pnpm --filter @xunjianbao/api test
corepack pnpm --filter @xunjianbao/media-worker test
```

Expected: the 1-second API/worker cases fail because the current minimum is 2.

- [ ] **Step 3: Implement the minimum validation change**

Change API validation to:

```ts
if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 5) {
  throw new BadRequestException("抽帧间隔必须为 1 至 5 秒");
}
```

Change worker input validation to use the same numeric range.

- [ ] **Step 4: Run API and worker tests**

Expected: all API and media-worker tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/media services/media-worker/src
git commit -m "feat: support one-second frame extraction"
```

### Task 2: Add Stable Detail Navigation and Upload Options

**Files:**
- Create: `apps/admin-web/src/pages/media-library-navigation.ts`
- Create: `apps/admin-web/src/pages/media-library-navigation.test.ts`
- Modify: `apps/admin-web/src/pages/MediaLibraryPage.tsx`

**Interfaces:**
- Produces: `FRAME_INTERVAL_OPTIONS`, `getMediaTaskDetailPath(taskId)`, and `shouldOpenMediaTaskDetail(isPersisted)`.
- Consumes: `VideoAnalysisTask.isPersisted` and React Router `navigate`.

- [ ] **Step 1: Write failing frontend helper tests**

```ts
test("offers every frame interval from one to five seconds", () => {
  assert.deepEqual(FRAME_INTERVAL_OPTIONS.map((item) => item.value), [1, 2, 3, 4, 5]);
});

test("builds an encoded persisted media task detail route", () => {
  assert.equal(getMediaTaskDetailPath("media/task 1"), "/media-library/media%2Ftask%201");
});
```

- [ ] **Step 2: Run the helper test and verify it fails because the module does not exist**

Run:

```bash
corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/media-library-navigation.test.ts
```

- [ ] **Step 3: Implement helpers and update the list page**

Implement:

```ts
export const FRAME_INTERVAL_OPTIONS = [1, 2, 3, 4, 5].map((seconds) => ({
  label: `${seconds} 秒/帧`,
  value: seconds,
}));

export function getMediaTaskDetailPath(taskId: string) {
  return `/media-library/${encodeURIComponent(taskId)}`;
}
```

Use the options in the upload selector. For persisted tasks, card click and Enter/Space navigate to the detail path; demo tasks retain in-page selection for the existing event prototype. Remove child-asset state, child fetching, and `MediaAssetGallery` from the list page.

- [ ] **Step 4: Run the frontend helper tests and production type check**

Expected: tests and `corepack pnpm --filter @xunjianbao/admin-web build` pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/pages/MediaLibraryPage.tsx apps/admin-web/src/pages/media-library-navigation.*
git commit -m "feat: route media tasks to detail pages"
```

### Task 3: Build the Media Task Detail Page

**Files:**
- Modify: `services/api/src/modules/media/media.service.test.ts`
- Modify: `services/api/src/modules/media/media.service.ts`
- Create: `apps/admin-web/src/pages/MediaTaskDetailPage.tsx`
- Create: `apps/admin-web/src/pages/media-task-detail-presenter.ts`
- Create: `apps/admin-web/src/pages/media-task-detail-presenter.test.ts`
- Modify: `apps/admin-web/src/pages/media-library-detail.css`
- Modify: `apps/admin-web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /media-assets/:id`, `GET /media-assets/:id/children`, `MediaAssetGallery`, and authenticated content URLs.
- Produces: route `/media-library/:taskId` with task metadata, original video playback, child media gallery, retry/error/empty states, and report navigation.

- [ ] **Step 1: Write failing API detail and presenter tests**

Update the API test to require `getAsset()` to request the latest job and first child preview:

```ts
assert.deepEqual(findUniqueCalls[0], {
  where: { id: "media-video-1" },
  include: {
    jobs: { orderBy: { createdAt: "desc" }, take: 1 },
    frames: { orderBy: [{ videoTimestampMs: "asc" }, { createdAt: "asc" }], take: 1 },
  },
});
```

Add a presenter test verifying video task metadata and the content URL:

```ts
const detail = toMediaTaskDetail(record, (path) => `api:${path}`);
assert.equal(detail.intervalLabel, "每 1 秒抽 1 帧");
assert.equal(detail.videoUrl, "api:/media-assets/media-1/content");
```

- [ ] **Step 2: Run the focused tests and verify failure**

Expected: API include assertion and missing presenter fail.

- [ ] **Step 3: Implement API detail relations and presenter**

Make `getAsset(id)` include the latest job and first ordered child. Map video versus image bundle labels, processing state, interval, counts, and authenticated video URL in the presenter.

- [ ] **Step 4: Implement the detail page and route**

The page must:

```tsx
const { taskId = "" } = useParams();
const [task, setTask] = useState<MediaTaskDetail | null>(null);
const [items, setItems] = useState<MediaGalleryItem[]>([]);
```

Load task and children together with abort handling. Render a compact header with a back button, metadata, a native `<video controls preload="metadata">` for video tasks, and `MediaAssetGallery` for child images. Route “写报告” to `/reports/write?mediaId=...`. Render explicit loading, error with retry, and no-assets states.

Add to `App.tsx`:

```tsx
<Route path="/media-library/:taskId" element={<MediaTaskDetailPage />} />
```

Add responsive CSS using stable grids: metadata wraps without vertical text, video keeps a 16:9 aspect ratio, and the gallery uses existing breakpoints.

- [ ] **Step 5: Run focused tests and production build**

Expected: API tests, presenter tests, and admin build pass.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/modules/media apps/admin-web/src
git commit -m "feat: add media task detail page"
```

### Task 4: Browser Acceptance, Documentation, and Sync

**Files:**
- Modify: `README.md`
- Modify: `docs/开发阶段记录.md`

**Interfaces:**
- Verifies the complete UI and records the frozen module behavior.

- [ ] **Step 1: Browser acceptance on `http://127.0.0.1:5181/media-library`**

Verify:

- selector exposes 1 through 5 seconds;
- clicking a real persisted task changes the URL to `/media-library/:taskId`;
- no `素材预览` region remains under the list;
- detail page shows original video for video tasks and child images;
- image “写报告” opens `/reports/write?mediaId=...`;
- back button returns to the media library;
- no new application console errors are produced.

- [ ] **Step 2: Update documentation**

Document the 1-5 second interval, dedicated detail route, video player, child gallery, and report handoff. State that AI analysis remains a separate later module.

- [ ] **Step 3: Run the complete verification suite**

```bash
corepack pnpm --filter @xunjianbao/api test
corepack pnpm --filter @xunjianbao/media-worker test
corepack pnpm --filter @xunjianbao/api exec tsx --test \
  ../../apps/admin-web/src/pages/media-task-adapter.test.ts \
  ../../apps/admin-web/src/pages/media-library-navigation.test.ts \
  ../../apps/admin-web/src/pages/media-task-detail-presenter.test.ts \
  ../../apps/admin-web/src/components/media-task-preview.test.ts \
  ../../apps/admin-web/src/components/media-asset-presenter.test.ts \
  ../../apps/admin-web/src/pages/report-media-adapter.test.ts
corepack pnpm build
git diff --check
```

Expected: zero test failures, successful production build, and no whitespace errors.

- [ ] **Step 4: Commit and push**

```bash
git add README.md docs/开发阶段记录.md
git commit -m "docs: record media task detail workflow"
git push origin codex/real-workflow-v1
```
