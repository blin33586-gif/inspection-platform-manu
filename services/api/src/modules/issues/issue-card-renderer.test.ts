import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { buildIssueCardSvg, renderIssueCard } from "./issue-card-renderer.js";

const sampleInput = {
  annotatedPhoto: Buffer.alloc(0),
  locationName: "广灵二路小区北门",
  foundAt: "2026-07-12 11:06",
  category: "暴露垃圾",
  description: "垃圾桶周边散落生活垃圾，地面有污渍。",
  shareUrl: "https://example.test/s/issue/token",
};

test("keeps a 70 percent photo region and a reserved QR column", () => {
  const svg = buildIssueCardSvg({ ...sampleInput, qrDataUrl: "data:image/png;base64,AA==" });

  assert.match(svg, /data-role="photo"[^>]*height="980"/);
  assert.match(svg, /data-role="qr"[^>]*x="930"/);
  assert.match(svg, />扫码查看问题详情</);
});

test("renders a valid PNG", async () => {
  const annotatedPhoto = await sharp({
    create: { width: 800, height: 600, channels: 4, background: "#7f9bb2" },
  }).png().toBuffer();
  const output = await renderIssueCard({ ...sampleInput, annotatedPhoto });

  assert.deepEqual([...output.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("preserves source photo pixels in the 70 percent photo region", async () => {
  const annotatedPhoto = await sharp({
    create: { width: 800, height: 600, channels: 4, background: { r: 127, g: 155, b: 178, alpha: 1 } },
  }).png().toBuffer();
  const output = await renderIssueCard({ ...sampleInput, annotatedPhoto });
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  const offset = (300 * info.width + 600) * info.channels;

  assert.ok(data[offset] < 170, `expected photo red channel below 170, received ${data[offset]}`);
  assert.ok(data[offset + 2] > 150, `expected photo blue channel above 150, received ${data[offset + 2]}`);
});
