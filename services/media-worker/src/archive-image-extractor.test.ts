import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import * as yazl from "yazl";
import {
  defaultArchiveLimits,
  detectImageMime,
  extractArchiveImages,
  validateArchiveEntryName,
} from "./archive-image-extractor.js";

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webpBytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x18, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const gifBytes = Buffer.from("GIF89a", "ascii");
const bmpBytes = Buffer.from([
  0x42, 0x4d, 0x3a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x36, 0x00, 0x00, 0x00,
  0x28, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00,
  0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x13, 0x0b, 0x00, 0x00,
  0x13, 0x0b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0x00,
]);
const tiffBytes = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
const heifBytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
const appleDoubleBytes = Buffer.from([0x00, 0x05, 0x16, 0x07, 0x00, 0x02, 0x00, 0x00, ...Buffer.from("Mac OS X", "ascii")]);

async function writeZip(path: string, entries: Array<{ name: string; data: Buffer }>) {
  const zip = new yazl.ZipFile();
  entries.forEach((entry) => zip.addBuffer(entry.data, entry.name));
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
}

test("flattens nested JPG and PNG entries and ignores other files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "xunjianbao-archive-test-"));
  const archivePath = join(directory, "photos.zip");
  const outputDirectory = join(directory, "output");
  await writeZip(archivePath, [
    { name: "a/first.jpg", data: jpegBytes },
    { name: "b/second.png", data: pngBytes },
    { name: "notes/readme.txt", data: Buffer.from("ignored") },
  ]);

  try {
    const images = await extractArchiveImages(archivePath, outputDirectory, defaultArchiveLimits);

    assert.deepEqual(images.map((item) => item.fileName), ["first.jpg", "second.png"]);
    assert.deepEqual(images.map((item) => item.mimeType), ["image/jpeg", "image/png"]);
    assert.equal(images[0].fileSize, jpegBytes.length);
    assert.deepEqual(await readFile(images[1].storagePath), pngBytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ignores macOS AppleDouble metadata in an otherwise valid ZIP", async () => {
  const directory = await mkdtemp(join(tmpdir(), "xunjianbao-archive-macos-"));
  const archivePath = join(directory, "photos.zip");
  const outputDirectory = join(directory, "output");
  await writeZip(archivePath, [
    { name: "巡检/photo.png", data: pngBytes },
    { name: "__MACOSX/._photo.png", data: appleDoubleBytes },
    { name: ".DS_Store", data: Buffer.from("Finder metadata") },
  ]);

  try {
    const images = await extractArchiveImages(archivePath, outputDirectory);
    assert.deepEqual(images.map((item) => item.fileName), ["photo.png"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("renames duplicate flat image names without overwriting", async () => {
  const directory = await mkdtemp(join(tmpdir(), "xunjianbao-archive-duplicate-"));
  const archivePath = join(directory, "photos.zip");
  const outputDirectory = join(directory, "output");
  await writeZip(archivePath, [
    { name: "north/photo.jpg", data: jpegBytes },
    { name: "south/photo.jpg", data: jpegBytes },
  ]);

  try {
    const images = await extractArchiveImages(archivePath, outputDirectory, defaultArchiveLimits);
    assert.deepEqual(images.map((item) => basename(item.storagePath)), ["photo.jpg", "photo-2.jpg"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects traversal and absolute archive entry names", () => {
  assert.throws(() => validateArchiveEntryName("../outside.jpg"), /路径无效/);
  assert.throws(() => validateArchiveEntryName("/absolute/photo.jpg"), /路径无效/);
  assert.throws(() => validateArchiveEntryName("C:\\photo.jpg"), /路径无效/);
});

test("rejects image content that does not match the extension", () => {
  assert.throws(() => detectImageMime("fake.jpg", Buffer.from("not-an-image")), /图片格式无效/);
  assert.throws(() => detectImageMime("fake.png", jpegBytes), /图片格式无效/);
});

test("recognizes common image formats only when the extension matches the file header", () => {
  assert.equal(detectImageMime("inspection.jfif", jpegBytes), "image/jpeg");
  assert.equal(detectImageMime("inspection.webp", webpBytes), "image/webp");
  assert.equal(detectImageMime("inspection.gif", gifBytes), "image/gif");
  assert.equal(detectImageMime("inspection.bmp", bmpBytes), "image/bmp");
  assert.equal(detectImageMime("inspection.tiff", tiffBytes), "image/tiff");
  assert.equal(detectImageMime("inspection.heic", heifBytes), "image/heif");
  assert.throws(() => detectImageMime("inspection.heic", pngBytes), /图片格式无效/);
});

test("converts a BMP archive image into a browser-safe JPEG preview", async () => {
  const directory = await mkdtemp(join(tmpdir(), "xunjianbao-archive-preview-"));
  const archivePath = join(directory, "photos.zip");
  const outputDirectory = join(directory, "output");
  await writeZip(archivePath, [{ name: "inspection.bmp", data: bmpBytes }]);

  try {
    const [image] = await extractArchiveImages(archivePath, outputDirectory);
    assert.equal(image.mimeType, "image/bmp");
    assert.equal(image.previewMimeType, "image/jpeg");
    assert.match(image.previewStoragePath ?? "", /\.jpg$/);
    assert.deepEqual((await readFile(image.previewStoragePath!)).subarray(0, 3), Buffer.from([0xff, 0xd8, 0xff]));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("enforces image count and expanded size limits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "xunjianbao-archive-limit-"));
  const archivePath = join(directory, "photos.zip");
  await writeZip(archivePath, [
    { name: "one.jpg", data: jpegBytes },
    { name: "two.jpg", data: jpegBytes },
  ]);

  try {
    await assert.rejects(
      () => extractArchiveImages(archivePath, join(directory, "count"), { ...defaultArchiveLimits, maxImages: 1 }),
      /图片数量/,
    );
    await assert.rejects(
      () => extractArchiveImages(archivePath, join(directory, "size"), { ...defaultArchiveLimits, maxExpandedBytes: 5 }),
      /文件总量/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
