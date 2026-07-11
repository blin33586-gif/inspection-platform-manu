import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { MAP_HOT_AREA_COLOR_OPTIONS, type MapHotAreaColor, type ObjectType } from "@xunjianbao/shared";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { parseMapGeometry } from "./map-geometry.js";

interface CreateHotAreaInput {
  label?: string;
  objectType?: ObjectType;
  objectId?: string;
  x?: string;
  y?: string;
  width?: string;
  height?: string;
  polygon?: string;
  color?: string;
}

interface UpdateHotAreaInput {
  label?: string;
  polygon?: string;
  color?: string;
}

const allowedObjectTypes: ObjectType[] = ["community", "road", "point", "street"];
const allowedMapHotAreaColors = new Set<MapHotAreaColor>(MAP_HOT_AREA_COLOR_OPTIONS.map((option) => option.value));

@Injectable()
export class MapHotAreaService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async create(mapAssetId: string, input: CreateHotAreaInput) {
    const mapAsset = await this.database.mapAsset.findUnique({ where: { id: mapAssetId } });
    if (!mapAsset) throw new NotFoundException("Map asset not found");

    if (!input.label?.trim()) throw new BadRequestException("Hot area label is required");
    if (!input.objectType || !allowedObjectTypes.includes(input.objectType)) {
      throw new BadRequestException("Invalid object type");
    }

    const polygon = input.polygon?.trim()
      ? JSON.stringify(parseMapGeometry(input.polygon))
      : null;

    const hotArea = await this.database.mapHotArea.create({
      data: {
        id: `ha-${randomUUID()}`,
        mapAssetId,
        label: input.label.trim(),
        objectType: input.objectType,
        objectId: input.objectId?.trim() || null,
        x: this.parseOptionalNumber(input.x),
        y: this.parseOptionalNumber(input.y),
        width: this.parseOptionalNumber(input.width),
        height: this.parseOptionalNumber(input.height),
        polygon,
        color: this.parseOptionalColor(input.color),
      },
      select: { id: true, label: true, objectType: true, objectId: true, x: true, y: true, width: true, height: true, polygon: true, color: true },
    });

    await this.database.mapAsset.update({
      where: { id: mapAssetId },
      data: {
        hotAreaCount: { increment: 1 },
        ...(mapAsset.processStatus === "uploaded" ? { processStatus: "processed" } : {}),
      },
    });

    await this.auditService.record({
      action: "map.hotArea.create",
      targetType: "mapHotArea",
      targetId: hotArea.id,
      summary: `为地图「${mapAsset.name}」新增热区「${hotArea.label}」`,
    });

    return hotArea;
  }

  async update(mapAssetId: string, hotAreaId: string, input: UpdateHotAreaInput) {
    const existing = await this.database.mapHotArea.findFirst({
      where: { id: hotAreaId, mapAssetId },
      include: { mapAsset: { select: { name: true } } },
    });
    if (!existing) throw new NotFoundException("Map hot area not found");

    const data: { label?: string; polygon?: string; color?: MapHotAreaColor } = {};
    if (input.label !== undefined) {
      if (!input.label.trim()) throw new BadRequestException("Hot area label is required");
      data.label = input.label.trim();
    }
    if (input.polygon !== undefined) {
      if (!input.polygon.trim()) throw new BadRequestException("Map geometry is required");
      data.polygon = JSON.stringify(parseMapGeometry(input.polygon));
    }
    if (input.color !== undefined) data.color = this.parseRequiredColor(input.color);
    if (!Object.keys(data).length) throw new BadRequestException("No map hot area fields to update");

    const hotArea = await this.database.mapHotArea.update({
      where: { id: existing.id },
      data,
      select: { id: true, label: true, objectType: true, objectId: true, x: true, y: true, width: true, height: true, polygon: true, color: true },
    });

    await this.auditService.record({
      action: "map.hotArea.update",
      targetType: "mapHotArea",
      targetId: hotArea.id,
      summary: `编辑地图「${existing.mapAsset.name}」标绘「${hotArea.label}」`,
    });

    return hotArea;
  }

  async remove(mapAssetId: string, hotAreaId: string) {
    const existing = await this.database.mapHotArea.findFirst({
      where: { id: hotAreaId, mapAssetId },
      include: { mapAsset: { select: { name: true } } },
    });
    if (!existing) throw new NotFoundException("Map hot area not found");

    await this.database.$transaction(async (transaction) => {
      await transaction.mapHotArea.delete({ where: { id: existing.id } });
      await transaction.mapAsset.update({
        where: { id: mapAssetId },
        data: { hotAreaCount: { decrement: 1 } },
      });
    });

    await this.auditService.record({
      action: "map.hotArea.delete",
      targetType: "mapHotArea",
      targetId: existing.id,
      summary: `从地图「${existing.mapAsset.name}」删除标绘「${existing.label}」`,
    });
  }

  private parseOptionalNumber(value: string | undefined) {
    if (value === undefined || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new BadRequestException("Invalid hot area coordinate");
    return parsed;
  }

  private parseOptionalColor(value: string | undefined): MapHotAreaColor | null {
    if (value === undefined) return null;
    return this.parseRequiredColor(value);
  }

  private parseRequiredColor(value: string): MapHotAreaColor {
    const color = value.trim() as MapHotAreaColor;
    if (!allowedMapHotAreaColors.has(color)) throw new BadRequestException("Invalid map hot area color");
    return color;
  }
}
