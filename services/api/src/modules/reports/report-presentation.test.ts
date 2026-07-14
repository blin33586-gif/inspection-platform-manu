import assert from "node:assert/strict";
import test from "node:test";
import { buildReportPhotoPageModel, REPORT_DOCUMENT_COPY } from "@xunjianbao/shared";

test("publishes one shared set of report document labels", () => {
  assert.deepEqual(REPORT_DOCUMENT_COPY, {
    kicker: "巡检宝 · 综合巡检报告",
    reportDate: "巡检日期",
    relatedObject: "巡检区域",
    issueCount: "问题数量",
    photoCount: "照片数量",
    photoFile: "照片文件",
    videoTime: "视频时间点",
    coordinates: "经纬度",
  });
});

test("builds the shared report photo labels used by web and PDF", () => {
  assert.deepEqual(buildReportPhotoPageModel({
    index: 0,
    relatedObjectName: "曲阳路街道重点区域",
    fileName: "DJI_0003.jpg",
    issueTitle: "飞线问题",
    issueCategory: "飞线",
    issueDescription: null,
    videoTimestampMs: 65_432,
    latitude: 31.23456789,
    longitude: 121.45678912,
  }), {
    indexLabel: "问题 01",
    title: "飞线问题",
    fileName: "DJI_0003.jpg",
    videoTime: "01:05",
    coordinates: "31.234568, 121.456789",
    description: "该照片已纳入本次巡检综合报告。",
    footer: "巡检宝 · 曲阳路街道重点区域 · 第 1 页",
  });
});

test("omits unavailable optional metadata and falls back to category", () => {
  const model = buildReportPhotoPageModel({
    index: 8,
    relatedObjectName: "重点区域",
    fileName: "photo.jpg",
    issueTitle: null,
    issueCategory: "占道经营",
    issueDescription: "现场已记录",
    videoTimestampMs: null,
    latitude: null,
    longitude: 121.4,
  });

  assert.equal(model.indexLabel, "问题 09");
  assert.equal(model.title, "占道经营");
  assert.equal(model.videoTime, null);
  assert.equal(model.coordinates, null);
  assert.equal(model.description, "现场已记录");
});
