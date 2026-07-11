import assert from "node:assert/strict";
import test from "node:test";
import {
  FRAME_INTERVAL_OPTIONS,
  getMediaTaskDetailPath,
  shouldOpenMediaTaskDetail,
} from "./media-library-navigation.js";

test("offers every frame interval from one to five seconds", () => {
  assert.deepEqual(FRAME_INTERVAL_OPTIONS, [
    { label: "1 秒/帧", value: 1 },
    { label: "2 秒/帧", value: 2 },
    { label: "3 秒/帧", value: 3 },
    { label: "4 秒/帧", value: 4 },
    { label: "5 秒/帧", value: 5 },
  ]);
});

test("builds an encoded persisted media task detail route", () => {
  assert.equal(getMediaTaskDetailPath("media/task 1"), "/media-library/media%2Ftask%201");
  assert.equal(shouldOpenMediaTaskDetail(true), true);
  assert.equal(shouldOpenMediaTaskDetail(false), false);
});
