import { BadRequestException } from "@nestjs/common";

export interface TileMapBounds {
  west: number;
  east: number;
  north: number;
  south: number;
}

export interface TilePackageMetadata {
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  bounds: TileMapBounds;
}

interface TileCoordinate {
  z: number;
  x: number;
  y: number;
}

const tilePathPattern = /^(?:[^/]+\/)?(\d{1,2})\/(\d+)\/(\d+)\.png$/i;

export function describeTilePackage(entries: string[]): TilePackageMetadata {
  const tiles = entries.map((entry) => parseTileCoordinate(normalizeTilePackagePath(entry)));
  if (!tiles.length) throw new BadRequestException("瓦片包中未找到 PNG 瓦片");

  const bounds = tiles.reduce<TileMapBounds | undefined>((result, tile) => {
    const tileBounds = toTileBounds(tile);
    if (!result) return tileBounds;
    return {
      west: Math.min(result.west, tileBounds.west),
      east: Math.max(result.east, tileBounds.east),
      north: Math.max(result.north, tileBounds.north),
      south: Math.min(result.south, tileBounds.south),
    };
  }, undefined);

  const zooms = tiles.map((tile) => tile.z);
  return {
    minZoom: Math.min(...zooms),
    maxZoom: Math.max(...zooms),
    tileCount: tiles.length,
    bounds: bounds!,
  };
}

export function normalizeTilePackagePath(entry: string) {
  const normalizedEntry = entry.replace(/^\.\//, "");
  if (!normalizedEntry || normalizedEntry.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new BadRequestException("瓦片包仅支持 z/x/y.png 目录结构");
  }

  const match = normalizedEntry.match(tilePathPattern);
  if (!match) throw new BadRequestException("瓦片包仅支持 z/x/y.png 目录结构");
  const [, zoomText, xText, yText] = match;
  return `${Number(zoomText)}/${Number(xText)}/${Number(yText)}.png`;
}

function parseTileCoordinate(entry: string): TileCoordinate {
  const match = entry.match(tilePathPattern);
  if (!match) throw new BadRequestException("瓦片包仅支持 z/x/y.png 目录结构");

  const [, zoomText, xText, yText] = match;
  const z = Number(zoomText);
  const x = Number(xText);
  const y = Number(yText);
  const coordinateLimit = 2 ** z;

  if (!Number.isInteger(z) || z < 0 || z > 22 || x < 0 || y < 0 || x >= coordinateLimit || y >= coordinateLimit) {
    throw new BadRequestException("瓦片坐标超出有效范围");
  }

  return { z, x, y };
}

function toTileBounds(tile: TileCoordinate): TileMapBounds {
  const tileCount = 2 ** tile.z;
  return {
    west: (tile.x / tileCount) * 360 - 180,
    east: ((tile.x + 1) / tileCount) * 360 - 180,
    north: mercatorLatitude(tile.y, tileCount),
    south: mercatorLatitude(tile.y + 1, tileCount),
  };
}

function mercatorLatitude(y: number, tileCount: number) {
  const radians = Math.PI - (2 * Math.PI * y) / tileCount;
  return (180 / Math.PI) * Math.atan(Math.sinh(radians));
}
