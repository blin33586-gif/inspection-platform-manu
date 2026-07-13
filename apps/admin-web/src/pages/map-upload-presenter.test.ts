import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMapFileSize,
  isSupportedMapFile,
  mapMapHistoryResponse,
  mapStatusLabel,
  MapUploadRequestGate,
  presentMapFailureReason,
  shouldPollMapHistory,
} from "./map-upload-presenter.js";

test("formats map file sizes without hiding missing values", () => {
  assert.equal(formatMapFileSize(null), "-");
  assert.equal(formatMapFileSize(512), "512 B");
  assert.equal(formatMapFileSize(1_572_864), "1.5 MB");
});

test("presents the five approved map states", () => {
  assert.equal(mapStatusLabel({ processStatus: "queued", isActive: false }), "等待处理");
  assert.equal(mapStatusLabel({ processStatus: "running", isActive: false }), "处理中");
  assert.equal(mapStatusLabel({ processStatus: "published", isActive: true }), "当前使用");
  assert.equal(mapStatusLabel({ processStatus: "failed", isActive: false }), "处理失败");
  assert.equal(mapStatusLabel({ processStatus: "published", isActive: false }), "历史版本");
});

test("presents legacy map states as approved terminal labels", () => {
  for (const processStatus of ["processed", "uploaded", "ready"]) {
    assert.equal(mapStatusLabel({ processStatus, isActive: false }), "历史版本");
  }
  assert.equal(mapStatusLabel({ processStatus: "processed", isActive: true }), "当前使用");
});

test("accepts only TIFF and ZIP names", () => {
  assert.equal(isSupportedMapFile("park.tif"), true);
  assert.equal(isSupportedMapFile("PARK.TIFF"), true);
  assert.equal(isSupportedMapFile("tiles.zip"), true);
  assert.equal(isSupportedMapFile("photo.jpg"), false);
  assert.equal(isSupportedMapFile("tiles.zip.exe"), false);
});

test("polls from the project-wide processing flag even when the active row is on another page", () => {
  assert.equal(shouldPollMapHistory({
    items: [{ processStatus: "published" }],
    hasProcessing: true,
  }), true);
  assert.equal(shouldPollMapHistory({
    items: [{ processStatus: "published" }, { processStatus: "failed" }],
    hasProcessing: false,
  }), false);
});

test("limits failure reasons and hides technical diagnostics", () => {
  assert.equal(presentMapFailureReason("瓦片包目录不正确\n请使用 z/x/y.png"), "瓦片包目录不正确 请使用 z/x/y.png");
  const unsafeFailures = [
    "gdal2tiles.py failed: /Users/worker/private/source.tif\nTraceback: secret",
    "处理失败：/srv/private/map/source.tif",
    "处理失败（/srv/private/map/source.tif）",
    "处理失败\n/srv/private/map/source.tif",
    "处理失败：file:///srv/private/map/source.tif",
    "处理失败：C:\\srv\\private\\map\\source.tif",
    "处理失败（C:/srv/private/map/source.tif）",
    "处理失败：\\\\server\\share\\private\\source.tif",
  ];
  for (const failure of unsafeFailures) {
    assert.equal(
      presentMapFailureReason(failure),
      "地图处理失败，请重新上传；如仍失败请联系管理员",
      failure,
    );
  }
  assert.equal(presentMapFailureReason("原因".repeat(100)).length <= 120, true);
});

test("upload gate rejects a second request synchronously and only releases its own controller", () => {
  const gate = new MapUploadRequestGate();
  const first = gate.tryStart();
  assert.ok(first);
  assert.equal(gate.tryStart(), null);

  const unrelated = new AbortController();
  assert.equal(gate.finish(unrelated), false);
  assert.equal(gate.tryStart(), null);
  assert.equal(gate.finish(first), true);

  const second = gate.tryStart();
  assert.ok(second);
  gate.abortCurrent();
  assert.equal(second.signal.aborted, true);
  assert.ok(gate.tryStart());
});

test("maps the history response into the table fields", () => {
  const history = mapMapHistoryResponse({
    hasProcessing: false,
    items: [{
      id: "map-1",
      name: "园区底图",
      mapType: "未分类地图",
      sourceType: "tiff",
      fileName: "map-1.tiff",
      originalFileName: "park-v2.tiff",
      mimeType: "image/tiff",
      fileSize: 1_572_864,
      isActive: false,
      processStatus: "failed",
      hotAreaCount: 0,
      uploadedByName: "张三",
      createdAt: "2026-07-14T02:03:04.000Z",
      activatedAt: null,
      errorMessage: "坐标系无法识别",
    }],
    page: 2,
    pageSize: 10,
    total: 11,
  });

  assert.deepEqual(history, {
    hasProcessing: false,
    items: [{
      id: "map-1",
      name: "园区底图",
      fileName: "park-v2.tiff",
      format: "TIFF",
      fileSize: 1_572_864,
      uploadedByName: "张三",
      uploadedAt: "2026-07-14T02:03:04.000Z",
      processStatus: "failed",
      statusLabel: "处理失败",
      isActive: false,
      errorMessage: "坐标系无法识别",
    }],
    page: 2,
    pageSize: 10,
    total: 11,
  });
});
