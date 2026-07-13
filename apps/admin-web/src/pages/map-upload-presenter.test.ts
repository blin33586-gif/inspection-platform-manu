import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMapFileSize,
  isSupportedMapFile,
  mapMapHistoryResponse,
  mapStatusLabel,
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

test("accepts only TIFF and ZIP names", () => {
  assert.equal(isSupportedMapFile("park.tif"), true);
  assert.equal(isSupportedMapFile("PARK.TIFF"), true);
  assert.equal(isSupportedMapFile("tiles.zip"), true);
  assert.equal(isSupportedMapFile("photo.jpg"), false);
  assert.equal(isSupportedMapFile("tiles.zip.exe"), false);
});

test("polls only while map processing is active", () => {
  assert.equal(shouldPollMapHistory([
    { processStatus: "published" },
    { processStatus: "queued" },
  ]), true);
  assert.equal(shouldPollMapHistory([{ processStatus: "processing" }]), true);
  assert.equal(shouldPollMapHistory([
    { processStatus: "published" },
    { processStatus: "failed" },
  ]), false);
});

test("maps the history response into the table fields", () => {
  const history = mapMapHistoryResponse({
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
