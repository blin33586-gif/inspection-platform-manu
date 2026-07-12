import assert from "node:assert/strict";
import test from "node:test";
import { validateTaskInput, type TaskUploadFile } from "./inspection-task-input.js";

function file(name: string): TaskUploadFile {
  return {
    filename: name,
    originalname: name,
    mimetype: "application/octet-stream",
    path: `/tmp/${name}`,
    size: 100,
  };
}

const base = { name: "曲阳路巡检", taskDate: "2026-07-11", sourceType: "manual", intervalSeconds: "3" };

test("accepts one video, one archive, or one-to-many direct images", () => {
  assert.equal(validateTaskInput({ ...base, inputType: "video" }, [file("flight.mp4")]).inputType, "video");
  assert.equal(validateTaskInput({ ...base, sourceType: "drone", inputType: "archive" }, [file("photos.zip")]).sourceType, "drone");
  assert.equal(validateTaskInput({ ...base, sourceType: "camera", inputType: "images" }, [file("a.jpg"), file("b.png")]).files.length, 2);
});

test("accepts every image format supported by ZIP tasks for direct image tasks", () => {
  const images = ["jpg", "jpeg", "jfif", "png", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif"]
    .map((extension) => file(`inspection.${extension}`));
  assert.equal(validateTaskInput({ ...base, inputType: "images" }, images).files.length, images.length);
});

test("rejects invalid source, mixed input, and file-count violations", () => {
  assert.throws(() => validateTaskInput({ ...base, sourceType: "unknown", inputType: "video" }, [file("flight.mp4")]), /任务来源/);
  assert.throws(() => validateTaskInput({ ...base, inputType: "video" }, [file("a.mp4"), file("b.mov")]), /一个视频/);
  assert.throws(() => validateTaskInput({ ...base, inputType: "archive" }, [file("a.zip"), file("b.zip")]), /一个 ZIP/);
  assert.throws(() => validateTaskInput({ ...base, inputType: "images" }, [file("a.jpg"), file("b.zip")]), /仅支持/);
  assert.throws(() => validateTaskInput({ ...base, inputType: "images" }, []), /至少选择一张图片/);
});

test("validates the video frame interval and task date", () => {
  assert.equal(validateTaskInput({ ...base, inputType: "video", intervalSeconds: "1" }, [file("a.mov")]).intervalSeconds, 1);
  assert.equal(validateTaskInput({ ...base, inputType: "video", intervalSeconds: "5" }, [file("a.mov")]).intervalSeconds, 5);
  assert.throws(() => validateTaskInput({ ...base, inputType: "video", intervalSeconds: "0" }, [file("a.mov")]), /1 至 5 秒/);
  assert.throws(() => validateTaskInput({ ...base, inputType: "video", taskDate: "not-a-date" }, [file("a.mov")]), /任务日期/);
});
