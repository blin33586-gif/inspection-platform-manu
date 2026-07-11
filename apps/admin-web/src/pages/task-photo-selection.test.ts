import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultTaskPhotoSelection,
  filterTaskPhotos,
  setTaskPhotoSelected,
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
