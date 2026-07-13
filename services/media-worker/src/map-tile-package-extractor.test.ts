import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import * as yazl from "yazl";
import {
  defaultTilePackageLimits,
  extractTilePackage,
  type TilePackageLimits,
} from "./map-tile-package-extractor.js";

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

async function writeZip(path: string, entries: Array<{ name: string; data?: Buffer; directory?: boolean }>) {
  const zip = new yazl.ZipFile();
  for (const entry of entries) {
    if (entry.directory) zip.addEmptyDirectory(entry.name);
    else zip.addBuffer(entry.data ?? pngBytes, entry.name);
  }
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
}

async function replaceZipEntryName(path: string, safeName: string, unsafeName: string) {
  assert.equal(Buffer.byteLength(safeName), Buffer.byteLength(unsafeName));
  const archive = await readFile(path);
  const safe = Buffer.from(safeName);
  const unsafe = Buffer.from(unsafeName);
  let replacements = 0;
  for (let offset = archive.indexOf(safe); offset >= 0; offset = archive.indexOf(safe, offset + unsafe.length)) {
    unsafe.copy(archive, offset);
    replacements += 1;
  }
  assert.ok(replacements >= 2, "expected local and central ZIP entry names");
  await writeFile(path, archive);
}

async function withFixture(
  entries: Array<{ name: string; data?: Buffer; directory?: boolean }>,
  run: (archivePath: string, outputDirectory: string, directory: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "xunjianbao-map-package-"));
  const archivePath = join(directory, "tiles.zip");
  const outputDirectory = join(directory, "tiles");
  await writeZip(archivePath, entries);
  try {
    await run(archivePath, outputDirectory, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("streams strict XYZ PNG entries and derives metadata", async () => {
  await withFixture([
    { name: "1/", directory: true },
    { name: "1/0/", directory: true },
    { name: "1/0/0.png" },
    { name: "2/2/1.png" },
  ], async (archivePath, outputDirectory) => {
    const metadata = await extractTilePackage({ sourcePath: archivePath, outputDirectory });

    assert.equal(metadata.tileCount, 2);
    assert.equal(metadata.minZoom, 1);
    assert.equal(metadata.maxZoom, 2);
    assert.deepEqual(await readFile(join(outputDirectory, "2/2/1.png")), pngBytes);
  });
});

test("rejects traversal, absolute paths, non-PNG files, and invalid directory levels", async () => {
  await withFixture([{ name: "xx/1/0.png" }], async (archivePath, outputDirectory) => {
    await replaceZipEntryName(archivePath, "xx/1/0.png", "../1/0.png");
    await assert.rejects(() => extractTilePackage({ sourcePath: archivePath, outputDirectory }), /路径无效/);
    await assert.rejects(() => stat(outputDirectory), { code: "ENOENT" });
  });

  await withFixture([{ name: "01/0/0.png" }], async (archivePath, outputDirectory) => {
    await replaceZipEntryName(archivePath, "01/0/0.png", "/1/0/0.png");
    await assert.rejects(() => extractTilePackage({ sourcePath: archivePath, outputDirectory }), /路径无效/);
  });

  await withFixture([{ name: "1/0/0.txt", data: Buffer.from("not png") }], async (archivePath, outputDirectory) => {
    await assert.rejects(() => extractTilePackage({ sourcePath: archivePath, outputDirectory }), /仅支持 z\/x\/y\.png/);
  });

  await withFixture([{ name: "layer/", directory: true }], async (archivePath, outputDirectory) => {
    await assert.rejects(() => extractTilePackage({ sourcePath: archivePath, outputDirectory }), /目录结构无效/);
  });

  await withFixture([{ name: "1/0/0.png" }], async (archivePath, outputDirectory) => {
    await replaceZipEntryName(archivePath, "1/0/0.png", "1\\0\\0.png");
    await assert.rejects(() => extractTilePackage({ sourcePath: archivePath, outputDirectory }), /路径无效/);
    await assert.rejects(() => stat(outputDirectory), { code: "ENOENT" });
  });

  await withFixture([{ name: "1/2/", directory: true }], async (archivePath, outputDirectory) => {
    await assert.rejects(() => extractTilePackage({ sourcePath: archivePath, outputDirectory }), /目录结构无效/);
  });
});

test("rejects files with a PNG name but non-PNG content", async () => {
  await withFixture([{ name: "1/0/0.png", data: Buffer.from("not-a-png") }], async (archivePath, outputDirectory) => {
    await assert.rejects(() => extractTilePackage({ sourcePath: archivePath, outputDirectory }), /PNG 内容无效/);
    await assert.rejects(() => stat(outputDirectory), { code: "ENOENT" });
  });
});

test("preserves the archive error when output cleanup also fails", async () => {
  await withFixture([{ name: "1/0/0.png", data: Buffer.from("not-a-png") }], async (archivePath, outputDirectory) => {
    let cleanupAttempts = 0;
    const extractWithFileOperations = extractTilePackage as unknown as (
      input: { sourcePath: string; outputDirectory: string },
      limits: TilePackageLimits,
      fileOperations: { removeOutput: () => never },
    ) => Promise<unknown>;

    await assert.rejects(
      () => extractWithFileOperations(
        { sourcePath: archivePath, outputDirectory },
        defaultTilePackageLimits,
        {
          removeOutput: () => {
            cleanupAttempts += 1;
            throw new Error("清理失败");
          },
        },
      ),
      /PNG 内容无效/,
    );
    assert.equal(cleanupAttempts, 1);
  });
});

test("rejects duplicate coordinates and coordinates outside their zoom range", async () => {
  await withFixture([{ name: "1/0/0.png" }, { name: "01/0/0.png" }], async (archivePath, outputDirectory) => {
    await assert.rejects(() => extractTilePackage({ sourcePath: archivePath, outputDirectory }), /重复瓦片坐标/);
  });

  await withFixture([{ name: "1/2/0.png" }], async (archivePath, outputDirectory) => {
    await assert.rejects(() => extractTilePackage({ sourcePath: archivePath, outputDirectory }), /坐标超出有效范围/);
  });
});

test("bounds archive entry count and expanded bytes", async () => {
  const limits = (overrides: Partial<TilePackageLimits>): TilePackageLimits => ({
    ...defaultTilePackageLimits,
    ...overrides,
  });

  await withFixture([{ name: "1/0/0.png" }, { name: "1/1/0.png" }], async (archivePath, outputDirectory) => {
    await assert.rejects(
      () => extractTilePackage({ sourcePath: archivePath, outputDirectory }, limits({ maxEntries: 1 })),
      /条目数量超过/,
    );
  });

  await withFixture([{ name: "1/0/0.png" }], async (archivePath, outputDirectory) => {
    await assert.rejects(
      () => extractTilePackage({ sourcePath: archivePath, outputDirectory }, limits({ maxExpandedBytes: 8 })),
      /展开大小超过/,
    );
  });
});
