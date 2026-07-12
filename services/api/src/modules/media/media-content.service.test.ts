import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MediaContentService } from "./media-content.service.js";

async function readStream(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("returns a complete image response", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-media-content-"));
  const imageDirectory = join(storageRoot, "media", "images");
  const imagePath = join(imageDirectory, "photo.jpg");
  await mkdir(imageDirectory, { recursive: true });
  await writeFile(imagePath, Buffer.from("image-content"));
  const database = {
    mediaAsset: {
      findUnique: async () => ({
        id: "image-1",
        storagePath: "storage/media/images/photo.jpg",
        mimeType: "image/jpeg",
        originalFileName: "photo.jpg",
      }),
    },
  };

  try {
    const service = new MediaContentService(database as never, storageRoot);
    const result = await service.resolveContent("image-1", undefined);

    assert.equal(result.statusCode, 200);
    assert.equal(result.headers["Content-Type"], "image/jpeg");
    assert.equal(result.headers["Content-Length"], 13);
    assert.equal((await readStream(result.stream)).toString(), "image-content");
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test("serves a browser-safe preview when a source image requires conversion", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-media-preview-"));
  const sourceDirectory = join(storageRoot, "media", "images");
  const previewDirectory = join(storageRoot, "media", "previews");
  await mkdir(sourceDirectory, { recursive: true });
  await mkdir(previewDirectory, { recursive: true });
  await writeFile(join(sourceDirectory, "inspection.heic"), Buffer.from("original-heic"));
  await writeFile(join(previewDirectory, "inspection.jpg"), Buffer.from("jpeg-preview"));
  const database = {
    mediaAsset: {
      findUnique: async () => ({
        id: "image-preview-1",
        storagePath: "storage/media/images/inspection.heic",
        mimeType: "image/heif",
        originalFileName: "inspection.heic",
        previewStoragePath: "storage/media/previews/inspection.jpg",
        previewMimeType: "image/jpeg",
      }),
    },
  };

  try {
    const service = new MediaContentService(database as never, storageRoot);
    const result = await service.resolveContent("image-preview-1", undefined);
    assert.equal(result.headers["Content-Type"], "image/jpeg");
    assert.equal((await readStream(result.stream)).toString(), "jpeg-preview");
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test("returns a partial video response for a byte range", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-video-content-"));
  const videoDirectory = join(storageRoot, "media", "videos");
  const videoPath = join(videoDirectory, "flight.mp4");
  await mkdir(videoDirectory, { recursive: true });
  await writeFile(videoPath, Buffer.from("0123456789"));
  const database = {
    mediaAsset: {
      findUnique: async () => ({
        id: "video-1",
        storagePath: "storage/media/videos/flight.mp4",
        mimeType: "video/mp4",
        originalFileName: "flight.mp4",
      }),
    },
  };

  try {
    const service = new MediaContentService(database as never, storageRoot);
    const result = await service.resolveContent("video-1", "bytes=2-5");

    assert.equal(result.statusCode, 206);
    assert.equal(result.headers["Content-Range"], "bytes 2-5/10");
    assert.equal(result.headers["Accept-Ranges"], "bytes");
    assert.equal(result.headers["Content-Length"], 4);
    assert.equal((await readStream(result.stream)).toString(), "2345");
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test("rejects an invalid or unsatisfiable byte range", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-range-content-"));
  const videoPath = join(storageRoot, "video.mp4");
  await writeFile(videoPath, "short");
  const database = {
    mediaAsset: {
      findUnique: async () => ({
        id: "video-1",
        storagePath: "storage/video.mp4",
        mimeType: "video/mp4",
        originalFileName: "video.mp4",
      }),
    },
  };

  try {
    const service = new MediaContentService(database as never, storageRoot);
    await assert.rejects(() => service.resolveContent("video-1", "bytes=100-200"), /请求范围无效/);
    await assert.rejects(() => service.resolveContent("video-1", "bytes=bad"), /请求范围无效/);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test("rejects a stored path outside the media storage root", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-path-content-"));
  const database = {
    mediaAsset: {
      findUnique: async () => ({
        id: "image-1",
        storagePath: "storage/../../outside.jpg",
        mimeType: "image/jpeg",
        originalFileName: "outside.jpg",
      }),
    },
  };

  try {
    const service = new MediaContentService(database as never, storageRoot);
    await assert.rejects(() => service.resolveContent("image-1", undefined), /媒体文件路径无效/);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});
