import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { posix, win32, join } from "node:path";
import { Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { TileMapMetadata } from "@xunjianbao/shared";
import { open, type Entry, type ZipFile } from "yauzl";

export interface TilePackageLimits {
  maxEntries: number;
  maxExpandedBytes: number;
}

export interface ExtractTilePackageInput {
  sourcePath: string;
  outputDirectory: string;
}

export const defaultTilePackageLimits: TilePackageLimits = {
  maxEntries: 500_000,
  maxExpandedBytes: 32 * 1024 ** 3,
};

const tilePathPattern = /^(\d{1,2})\/(\d+)\/(\d+)\.png$/;
const directoryPathPattern = /^(\d{1,2})\/(?:\d+\/)?$/;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function extractTilePackage(
  input: ExtractTilePackageInput,
  limits: TilePackageLimits = defaultTilePackageLimits,
): Promise<TileMapMetadata> {
  await mkdir(input.outputDirectory, { recursive: true });
  try {
    const archive = await openArchive(input.sourcePath);
    const metadata = await extractEntries(archive, input.outputDirectory, limits);
    await writeFile(join(input.outputDirectory, "tile-metadata.json"), JSON.stringify(metadata));
    return metadata;
  } catch (error) {
    await rm(input.outputDirectory, { recursive: true, force: true });
    throw error;
  }
}

function openArchive(sourcePath: string) {
  return new Promise<ZipFile>((resolveOpen, rejectOpen) => {
    open(sourcePath, {
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: false,
    }, (error, archive) => {
      if (error) rejectOpen(error);
      else resolveOpen(archive);
    });
  });
}

function extractEntries(
  archive: ZipFile,
  outputDirectory: string,
  limits: TilePackageLimits,
) {
  return new Promise<TileMapMetadata>((resolveExtract, rejectExtract) => {
    const coordinates = new Set<string>();
    let entryCount = 0;
    let declaredExpandedBytes = 0;
    let actualExpandedBytes = 0;
    let minZoom = Number.POSITIVE_INFINITY;
    let maxZoom = Number.NEGATIVE_INFINITY;
    let bounds: TileMapMetadata["bounds"] | undefined;
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      archive.close();
      rejectExtract(error);
    };

    archive.once("error", (error) => fail(normalizeArchiveError(error)));
    archive.once("end", () => {
      if (settled) return;
      if (!coordinates.size || !bounds) {
        fail(new Error("瓦片包中未找到 PNG 瓦片"));
        return;
      }
      settled = true;
      resolveExtract({ minZoom, maxZoom, tileCount: coordinates.size, bounds });
    });
    archive.on("entry", (entry: Entry) => {
      void processEntry(entry).then(() => {
        if (!settled) archive.readEntry();
      }, fail);
    });

    async function processEntry(entry: Entry) {
      entryCount += 1;
      if (entryCount > limits.maxEntries) throw new Error(`ZIP 条目数量超过 ${limits.maxEntries}`);
      validateEntryPath(entry.fileName);

      if (entry.fileName.endsWith("/")) {
        validateDirectoryPath(entry.fileName);
        return;
      }

      const coordinate = parseCoordinate(entry.fileName);
      const key = `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
      if (coordinates.has(key)) throw new Error(`ZIP 包含重复瓦片坐标：${key}`);

      declaredExpandedBytes += entry.uncompressedSize;
      if (declaredExpandedBytes > limits.maxExpandedBytes) {
        throw new Error(`ZIP 展开大小超过 ${limits.maxExpandedBytes} 字节`);
      }

      const directory = join(outputDirectory, String(coordinate.z), String(coordinate.x));
      const outputPath = join(directory, `${coordinate.y}.png`);
      await mkdir(directory, { recursive: true });
      const source = await openEntryStream(archive, entry);
      await pipeline(
        source,
        new PngValidationTransform((chunkBytes) => {
          actualExpandedBytes += chunkBytes;
          if (actualExpandedBytes > limits.maxExpandedBytes) {
            throw new Error(`ZIP 展开大小超过 ${limits.maxExpandedBytes} 字节`);
          }
        }),
        createWriteStream(outputPath, { flags: "wx" }),
      );

      coordinates.add(key);
      minZoom = Math.min(minZoom, coordinate.z);
      maxZoom = Math.max(maxZoom, coordinate.z);
      bounds = mergeBounds(bounds, tileBounds(coordinate.z, coordinate.x, coordinate.y));
    }

    archive.readEntry();
  });
}

function normalizeArchiveError(error: unknown) {
  if (error instanceof Error && /^(?:invalid relative path|absolute path|invalid characters in fileName):/.test(error.message)) {
    return new Error(`瓦片路径无效：${error.message.slice(error.message.indexOf(":") + 1).trim()}`);
  }
  return error;
}

function validateEntryPath(fileName: string) {
  if (
    !fileName
    || fileName.includes("\0")
    || fileName.includes("\\")
    || posix.isAbsolute(fileName)
    || win32.isAbsolute(fileName)
    || fileName.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`瓦片路径无效：${fileName}`);
  }
}

function validateDirectoryPath(fileName: string) {
  const match = fileName.match(directoryPathPattern);
  if (!match) throw new Error(`瓦片目录结构无效：${fileName}`);
  const z = Number(match[1]);
  if (z > 22) throw new Error(`瓦片目录结构无效：${fileName}`);
}

function parseCoordinate(fileName: string) {
  const match = fileName.match(tilePathPattern);
  if (!match) throw new Error(`瓦片包仅支持 z/x/y.png 目录结构：${fileName}`);
  const z = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  const coordinateLimit = 2 ** z;
  if (z > 22 || x >= coordinateLimit || y >= coordinateLimit) {
    throw new Error(`瓦片坐标超出有效范围：${fileName}`);
  }
  return { z, x, y };
}

function openEntryStream(archive: ZipFile, entry: Entry) {
  return new Promise<NodeJS.ReadableStream>((resolveStream, rejectStream) => {
    archive.openReadStream(entry, (error, stream) => {
      if (error) rejectStream(error);
      else resolveStream(stream);
    });
  });
}

class PngValidationTransform extends Transform {
  private readonly prefix: number[] = [];

  constructor(private readonly onBytes: (count: number) => void) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    try {
      this.onBytes(chunk.length);
      const needed = pngSignature.length - this.prefix.length;
      if (needed > 0) this.prefix.push(...chunk.subarray(0, needed));
      if (this.prefix.length === pngSignature.length && !Buffer.from(this.prefix).equals(pngSignature)) {
        callback(new Error("PNG 内容无效"));
        return;
      }
      callback(null, chunk);
    } catch (error) {
      callback(error as Error);
    }
  }

  override _flush(callback: TransformCallback) {
    if (this.prefix.length < pngSignature.length) callback(new Error("PNG 内容无效"));
    else callback();
  }
}

function mergeBounds(current: TileMapMetadata["bounds"] | undefined, next: TileMapMetadata["bounds"]) {
  if (!current) return next;
  return {
    west: Math.min(current.west, next.west),
    east: Math.max(current.east, next.east),
    north: Math.max(current.north, next.north),
    south: Math.min(current.south, next.south),
  };
}

function tileBounds(z: number, x: number, y: number) {
  const tileCount = 2 ** z;
  return {
    west: (x / tileCount) * 360 - 180,
    east: ((x + 1) / tileCount) * 360 - 180,
    north: mercatorLatitude(y, tileCount),
    south: mercatorLatitude(y + 1, tileCount),
  };
}

function mercatorLatitude(y: number, tileCount: number) {
  const radians = Math.PI - (2 * Math.PI * y) / tileCount;
  return (180 / Math.PI) * Math.atan(Math.sinh(radians));
}
