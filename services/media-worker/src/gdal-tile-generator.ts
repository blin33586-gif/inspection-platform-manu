import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { TileMapMetadata } from "@xunjianbao/shared";

const execFileAsync = promisify(execFile);

export interface GdalCommand {
  command: "gdal2tiles.py";
  args: string[];
}

export interface TiffTileGenerationInput {
  sourcePath: string;
  outputDirectory: string;
  minZoom: number;
  maxZoom: number;
}

export interface TiffTileGenerationResult {
  cogPath: string;
  tilePath: string;
  metadata: TileMapMetadata;
}

export function buildGdalTileCommand(sourcePath: string, outputDirectory: string, minZoom: number, maxZoom: number): GdalCommand {
  return {
    command: "gdal2tiles.py",
    args: ["--xyz", `--zoom=${minZoom}-${maxZoom}`, "--resampling=average", sourcePath, outputDirectory],
  };
}

export async function runTiffTileJob(input: TiffTileGenerationInput): Promise<TiffTileGenerationResult> {
  await mkdir(input.outputDirectory, { recursive: true });
  const cogPath = join(dirname(input.outputDirectory), `source-${randomUUID()}.cog.tif`);
  await execFileAsync("gdal_translate", ["-of", "COG", "-co", "COMPRESS=ZSTD", input.sourcePath, cogPath]);

  const tileCommand = buildGdalTileCommand(cogPath, input.outputDirectory, input.minZoom, input.maxZoom);
  await execFileAsync(tileCommand.command, tileCommand.args);

  const metadata = await describeGeneratedTiles(input.outputDirectory);
  await writeFile(join(input.outputDirectory, "tile-metadata.json"), JSON.stringify(metadata));

  return { cogPath, tilePath: input.outputDirectory, metadata };
}

async function describeGeneratedTiles(tileDirectory: string): Promise<TileMapMetadata> {
  const tileEntries = (await readdir(tileDirectory, { recursive: true }))
    .filter((entry) => /^\d{1,2}\/\d+\/\d+\.png$/i.test(entry));

  if (!tileEntries.length) throw new Error("GDAL 未生成有效的 XYZ 瓦片");

  const tiles = tileEntries.map((entry) => {
    const [zoom, x, imageName] = entry.split("/");
    return { z: Number(zoom), x: Number(x), y: Number(imageName.replace(/\.png$/i, "")) };
  });
  const zooms = tiles.map((tile) => tile.z);
  const bounds = tiles.reduce<TileMapMetadata["bounds"] | undefined>((current, tile) => {
    const next = tileBounds(tile.z, tile.x, tile.y);
    if (!current) return next;
    return {
      west: Math.min(current.west, next.west),
      east: Math.max(current.east, next.east),
      north: Math.max(current.north, next.north),
      south: Math.min(current.south, next.south),
    };
  }, undefined);

  return {
    minZoom: Math.min(...zooms),
    maxZoom: Math.max(...zooms),
    tileCount: tiles.length,
    bounds: bounds!,
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
