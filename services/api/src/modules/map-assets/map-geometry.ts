import { BadRequestException } from "@nestjs/common";

export type MapGeometryShape = "line" | "polygon" | "point";

export interface MapGeometry {
  shape: MapGeometryShape;
  coordinates: Array<[number, number]>;
}

export function parseMapGeometry(value: string): MapGeometry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new BadRequestException("标绘几何数据无效");
  }

  if (!parsed || typeof parsed !== "object") throw new BadRequestException("标绘几何数据无效");
  const geometry = parsed as { shape?: unknown; coordinates?: unknown };
  if (geometry.shape !== "line" && geometry.shape !== "polygon" && geometry.shape !== "point") {
    throw new BadRequestException("标绘类型无效");
  }
  if (!Array.isArray(geometry.coordinates)) throw new BadRequestException("标绘坐标无效");

  const coordinates = geometry.coordinates.map((coordinate) => toCoordinate(coordinate));
  const minimumPoints = geometry.shape === "polygon" ? 3 : geometry.shape === "line" ? 2 : 1;
  if (coordinates.length < minimumPoints) {
    const label = geometry.shape === "polygon" ? "区域" : geometry.shape === "line" ? "线" : "点位";
    throw new BadRequestException(`标绘${label}至少需要 ${minimumPoints} 个点`);
  }

  return { shape: geometry.shape, coordinates };
}

function toCoordinate(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new BadRequestException("经纬度坐标无效");
  const latitude = Number(value[0]);
  const longitude = Number(value[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new BadRequestException("经纬度坐标无效");
  }
  return [latitude, longitude];
}
