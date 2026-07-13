import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildGdalTileCommand, describeGeneratedTiles } from "./gdal-tile-generator.js";

test("generates XYZ tiles from a COG source", () => {
  assert.deepEqual(buildGdalTileCommand("source.tif", "tiles", 16, 19), {
    command: "gdal2tiles.py",
    args: ["--xyz", "--processes=1", "--zoom=16-19", "--resampling=average", "source.tif", "tiles"],
    env: { GDAL_CACHEMAX: "128" },
  });
});

test("describes generated tiles with a bounded directory walk", async () => {
  const directory = await mkdtemp(join(tmpdir(), "xunjianbao-gdal-tiles-"));
  try {
    await mkdir(join(directory, "1/0"), { recursive: true });
    await mkdir(join(directory, "2/2"), { recursive: true });
    await writeFile(join(directory, "1/0/0.png"), "tile");
    await writeFile(join(directory, "2/2/1.png"), "tile");
    await writeFile(join(directory, "2/2/notes.txt"), "ignored");

    const metadata = await describeGeneratedTiles(directory);
    assert.deepEqual({ minZoom: metadata.minZoom, maxZoom: metadata.maxZoom, tileCount: metadata.tileCount }, {
      minZoom: 1,
      maxZoom: 2,
      tileCount: 2,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
