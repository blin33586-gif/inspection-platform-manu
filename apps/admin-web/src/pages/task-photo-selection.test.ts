import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultTaskPhotoSelection,
  filterTaskPhotos,
  orderedSelectedTaskPhotos,
  setTaskPhotoSelected,
  taskPhotoEmptyDescription,
} from "./task-photo-selection.js";

const photos = [
  { id: "photo-pending", distributionStatus: "pending", mediaAsset: { id: "media-pending" } },
  { id: "photo-archived", distributionStatus: "archived", mediaAsset: { id: "media-archived" } },
  { id: "photo-ignored", distributionStatus: "ignored", mediaAsset: { id: "media-ignored" } },
];

test("defaults to every non-ignored task photo", () => {
  assert.deepEqual(defaultTaskPhotoSelection(photos), ["photo-pending", "photo-archived"]);
});

test("keeps a preferred ignored photo selected when entering from one media item", () => {
  assert.deepEqual(defaultTaskPhotoSelection(photos, "media-ignored"), [
    "photo-pending",
    "photo-archived",
    "photo-ignored",
  ]);
});

test("filters by distribution status without changing selection", () => {
  assert.deepEqual(filterTaskPhotos(photos, "ignored").map((photo) => photo.id), ["photo-ignored"]);
  assert.equal(filterTaskPhotos(photos, "all").length, 3);
});

test("toggles one photo while preserving selections from other pages", () => {
  const selected = new Set(["photo-pending", "photo-on-another-page"]);
  assert.deepEqual(
    [...setTaskPhotoSelected(selected, "photo-archived", true)],
    ["photo-pending", "photo-on-another-page", "photo-archived"],
  );
  assert.deepEqual(
    [...setTaskPhotoSelected(selected, "photo-pending", false)],
    ["photo-on-another-page"],
  );
});

test("shows a processing message before a task has produced photos", () => {
  assert.equal(taskPhotoEmptyDescription("queued"), "任务照片正在处理中");
  assert.equal(taskPhotoEmptyDescription("running"), "任务照片正在处理中");
  assert.equal(taskPhotoEmptyDescription("completed"), "当前筛选下没有照片");
});

test("preserves the saved report photo order when selection is unchanged", () => {
  const selected = new Set(["photo-pending", "photo-archived"]);
  assert.deepEqual(
    orderedSelectedTaskPhotos(photos, selected, ["photo-archived", "photo-pending"]).map((photo) => photo.id),
    ["photo-archived", "photo-pending"],
  );
});
