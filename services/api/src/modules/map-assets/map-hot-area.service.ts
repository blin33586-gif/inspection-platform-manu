import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ObjectType } from "@xunjianbao/shared";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";

interface CreateHotAreaInput {
  label?: string;
  objectType?: ObjectType;
  objectId?: string;
  x?: string;
  y?: string;
  width?: string;
  height?: string;
  polygon?: string;
}

const allowedObjectTypes: ObjectType[] = ["community", "road", "point", "street"];

@Injectable()
export class MapHotAreaService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async create(mapAssetId: string, input: CreateHotAreaInput) {
    const mapAsset = await this.database.mapAsset.findUnique({ where: { id: mapAssetId } });
    if (!mapAsset) throw new NotFoundException("Map asset not found");

    if (!input.label?.trim()) throw new BadRequestException("Hot area label is required");
    if (!input.objectType || !allowedObjectTypes.includes(input.objectType)) {
      throw new BadRequestException("Invalid object type");
    }

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
        polygon: input.polygon?.trim() || null,
      },
      select: { id: true, label: true, objectType: true, objectId: true, x: true, y: true, width: true, height: true, polygon: true },
    });

    await this.database.mapAsset.update({
      where: { id: mapAssetId },
      data: { hotAreaCount: { increment: 1 }, processStatus: "processed" },
    });

    return hotArea;
  }

  private parseOptionalNumber(value: string | undefined) {
    if (value === undefined || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new BadRequestException("Invalid hot area coordinate");
    return parsed;
  }
}
