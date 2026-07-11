import assert from "node:assert/strict";
import test from "node:test";
import { buildFrameExtractCommand } from "./ffmpeg-frame-extractor.js";

test("extracts one JPEG frame every three seconds", () => {
  assert.deepEqual(buildFrameExtractCommand("input.mp4", "frames/frame-%010d.jpg", 3), {
    command: "ffmpeg",
    args: ["-i", "input.mp4", "-vf", "fps=1/3", "-q:v", "2", "frames/frame-%010d.jpg"],
  });
});
