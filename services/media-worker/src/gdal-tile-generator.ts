import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TileMapMetadata } from "@xunjianbao/shared";

const maxErrorTailBytes = 64 * 1024;

export interface GdalCommand {
  command: "gdal2tiles.py";
  args: string[];
  env: { GDAL_CACHEMAX: "128" };
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
    args: ["--xyz", "--processes=1", `--zoom=${minZoom}-${maxZoom}`, "--resampling=average", sourcePath, outputDirectory],
    env: { GDAL_CACHEMAX: "128" },
  };
}

export async function runTiffTileJob(input: TiffTileGenerationInput): Promise<TiffTileGenerationResult> {
  await mkdir(input.outputDirectory, { recursive: true });
  const cogPath = join(input.outputDirectory, ".source.cog.tif");
  await runCommand("gdal_translate", ["-of", "COG", "-co", "COMPRESS=ZSTD", input.sourcePath, cogPath], {
    ...process.env,
    GDAL_CACHEMAX: "128",
  });

  const tileCommand = buildGdalTileCommand(cogPath, input.outputDirectory, input.minZoom, input.maxZoom);
  await runCommand(tileCommand.command, tileCommand.args, { ...process.env, ...tileCommand.env });

  const metadata = await describeGeneratedTiles(input.outputDirectory);
  await writeFile(join(input.outputDirectory, "tile-metadata.json"), JSON.stringify(metadata));

  return { cogPath, tilePath: input.outputDirectory, metadata };
}

export async function describeGeneratedTiles(tileDirectory: string): Promise<TileMapMetadata> {
  let minZoom = Number.POSITIVE_INFINITY;
  let maxZoom = Number.NEGATIVE_INFINITY;
  let tileCount = 0;
  let bounds: TileMapMetadata["bounds"] | undefined;

  for (const zoomEntry of await readdir(tileDirectory, { withFileTypes: true })) {
    if (!zoomEntry.isDirectory() || !/^\d{1,2}$/.test(zoomEntry.name)) continue;
    const z = Number(zoomEntry.name);
    for (const xEntry of await readdir(join(tileDirectory, zoomEntry.name), { withFileTypes: true })) {
      if (!xEntry.isDirectory() || !/^\d+$/.test(xEntry.name)) continue;
      const x = Number(xEntry.name);
      if (z > 22 || x >= 2 ** z) continue;
      for (const tileEntry of await readdir(join(tileDirectory, zoomEntry.name, xEntry.name), { withFileTypes: true })) {
        const match = tileEntry.isFile() ? tileEntry.name.match(/^(\d+)\.png$/) : null;
        if (!match) continue;
        const y = Number(match[1]);
        const next = tileBounds(z, x, y);
        bounds = bounds ? {
          west: Math.min(bounds.west, next.west),
          east: Math.max(bounds.east, next.east),
          north: Math.max(bounds.north, next.north),
          south: Math.min(bounds.south, next.south),
        } : next;
        minZoom = Math.min(minZoom, z);
        maxZoom = Math.max(maxZoom, z);
        tileCount += 1;
      }
    }
  }

  if (!tileCount || !bounds) throw new Error("GDAL 未生成有效的 XYZ 瓦片");
  return { minZoom, maxZoom, tileCount, bounds };
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "ignore", "pipe"] });
    let errorTail = Buffer.alloc(0);
    child.stderr.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      errorTail = Buffer.concat([errorTail, bytes]).subarray(-maxErrorTailBytes);
    });
    child.once("error", rejectRun);
    child.once("close", (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} 执行失败 (${signal ?? code ?? "unknown"})${errorTail.length ? `: ${errorTail.toString("utf8").trim()}` : ""}`));
    });
  });
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
