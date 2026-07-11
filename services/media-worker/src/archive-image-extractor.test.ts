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
