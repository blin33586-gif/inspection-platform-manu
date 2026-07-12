import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  type AnnotationDocumentPayload,
  type AnnotationSource,
  validateAnnotationDocument,
} from "@xunjianbao/media-contracts";
import { DatabaseService } from "../../database/database.service.js";

export interface SavePhotoAnnotationInput {
  expectedVersion?: number;
  annotationJson?: unknown;
  issueDescription?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  altitude?: number | null;
  source?: AnnotationSource;
}

@Injectable()
export class PhotoAnnotationService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getCurrent(photoId: string) {
    await this.requirePhoto(photoId);
    const document = await this.database.photoAnnotationDocument.findUnique({ where: { taskPhotoId: photoId } });
    return document ? presentDocument(document) : emptyDocument(photoId);
  }

  async listVersions(photoId: string) {
    await this.requirePhoto(photoId);
    const document = await this.database.photoAnnotationDocument.findUnique({
      where: { taskPhotoId: photoId },
      include: { versions: { orderBy: { version: "desc" } } },
    });
    if (!document) return [];
    return [presentCurrentVersion(document), ...document.versions.map(presentVersion)];
  }

  async getVersion(photoId: string, version: number) {
    if (!Number.isInteger(version) || version < 1) throw new BadRequestException("标注版本号无效");
    await this.requirePhoto(photoId);
    const document = await this.database.photoAnnotationDocument.findUnique({ where: { taskPhotoId: photoId } });
    if (!document) throw new NotFoundException("标注版本不存在");
    if (document.currentVersion === version) return presentCurrentVersion(document);

    const snapshot = await this.database.photoAnnotationVersion.findFirst({
      where: { documentId: document.id, version },
    });
    if (!snapshot) throw new NotFoundException("标注版本不存在");
    return presentVersion(snapshot);
  }

  async save(photoId: string, actor: string, input: SavePhotoAnnotationInput) {
    const expectedVersion = input.expectedVersion;
    if (!Number.isInteger(expectedVersion) || expectedVersion! < 0) {
      throw new BadRequestException("标注版本号无效");
    }
    const annotationJson = validateAnnotationDocument(input.annotationJson);
    const source = validateSource(input.source);
    const issueDescription = normalizeOptionalText(input.issueDescription, "问题说明");
    const { longitude, latitude, altitude } = validateLocation(input);

    return this.database.$transaction(async (transaction) => {
      const database = transaction as DatabaseService;
      const photo = await database.taskPhoto.findUnique({ where: { id: photoId }, select: { id: true } });
      if (!photo) throw new NotFoundException("任务照片不存在");

      const current = await database.photoAnnotationDocument.findUnique({ where: { taskPhotoId: photoId } });
      if (!current) {
        if (expectedVersion !== 0) throw new ConflictException("标注已被其他用户更新，请刷新后再保存");
        const created = await database.photoAnnotationDocument.create({
          data: {
            id: `annotation-${randomUUID()}`,
            taskPhotoId: photoId,
            currentVersion: 1,
            annotationJson: JSON.stringify(annotationJson),
            issueDescription,
            longitude,
            latitude,
            altitude,
            source,
            createdBy: actor,
            updatedBy: actor,
          },
        });
        await writeAudit(database, actor, photoId, 1);
        return presentDocument(created);
      }

      if (expectedVersion !== current.currentVersion) {
        throw new ConflictException("标注已被其他用户更新，请刷新后再保存");
      }

      const updated = await database.photoAnnotationDocument.updateMany({
        where: { id: current.id, currentVersion: expectedVersion },
        data: {
          currentVersion: { increment: 1 },
          annotationJson: JSON.stringify(annotationJson),
          issueDescription,
          longitude,
          latitude,
          altitude,
          source,
          updatedBy: actor,
        },
      });
      if (updated.count !== 1) throw new ConflictException("标注已被其他用户更新，请刷新后再保存");

      await database.photoAnnotationVersion.create({
        data: {
          id: `annotation-version-${randomUUID()}`,
          documentId: current.id,
          version: current.currentVersion,
          annotationJson: current.annotationJson,
          issueDescription: current.issueDescription,
          longitude: current.longitude,
          latitude: current.latitude,
          altitude: current.altitude,
          source: current.source,
          createdBy: current.updatedBy,
        },
      });
      const next = await database.photoAnnotationDocument.findUnique({ where: { id: current.id } });
      if (!next) throw new NotFoundException("标注文档不存在");
      await writeAudit(database, actor, photoId, next.currentVersion);
      return presentDocument(next);
    });
  }

  private async requirePhoto(photoId: string) {
    const photo = await this.database.taskPhoto.findUnique({ where: { id: photoId }, select: { id: true } });
    if (!photo) throw new NotFoundException("任务照片不存在");
  }
}

function emptyDocument(photoId: string) {
  return {
    taskPhotoId: photoId,
    currentVersion: 0,
    annotationJson: { canvasVersion: 1, elements: [] } satisfies AnnotationDocumentPayload,
    issueDescription: null,
    longitude: null,
    latitude: null,
    altitude: null,
    source: "manual" as const,
    createdBy: null,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
  };
}

function presentDocument(document: {
  taskPhotoId: string;
  currentVersion: number;
  annotationJson: string;
  issueDescription: string | null;
  longitude: number | null;
  latitude: number | null;
  altitude: number | null;
  source: string;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    taskPhotoId: document.taskPhotoId,
    currentVersion: document.currentVersion,
    annotationJson: parseAnnotationJson(document.annotationJson),
    issueDescription: document.issueDescription,
    longitude: document.longitude,
    latitude: document.latitude,
    altitude: document.altitude,
    source: document.source,
    createdBy: document.createdBy,
    updatedBy: document.updatedBy,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function presentVersion(version: {
  version: number;
  annotationJson: string;
  issueDescription: string | null;
  longitude: number | null;
  latitude: number | null;
  altitude: number | null;
  source: string;
  createdBy: string;
  createdAt: Date;
}) {
  return {
    version: version.version,
    annotationJson: parseAnnotationJson(version.annotationJson),
    issueDescription: version.issueDescription,
    longitude: version.longitude,
    latitude: version.latitude,
    altitude: version.altitude,
    source: version.source,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
  };
}

function presentCurrentVersion(document: {
  currentVersion: number;
  annotationJson: string;
  issueDescription: string | null;
  longitude: number | null;
  latitude: number | null;
  altitude: number | null;
  source: string;
  updatedBy: string;
  updatedAt: Date;
}) {
  return {
    version: document.currentVersion,
    annotationJson: parseAnnotationJson(document.annotationJson),
    issueDescription: document.issueDescription,
    longitude: document.longitude,
    latitude: document.latitude,
    altitude: document.altitude,
    source: document.source,
    createdBy: document.updatedBy,
    createdAt: document.updatedAt,
  };
}

function parseAnnotationJson(value: string): AnnotationDocumentPayload {
  try {
    return validateAnnotationDocument(JSON.parse(value));
  } catch {
    throw new BadRequestException("已保存的标注数据无效");
  }
}

function validateSource(value: AnnotationSource | undefined): AnnotationSource {
  if (value === undefined) return "manual";
  if (value === "manual" || value === "ai") return value;
  throw new BadRequestException("标注来源无效");
}

function normalizeOptionalText(value: string | null | undefined, label: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new BadRequestException(`${label}无效`);
  return value.trim() || null;
}

function validateLocation(input: SavePhotoAnnotationInput) {
  const longitude = nullableNumber(input.longitude, "经度", -180, 180);
  const latitude = nullableNumber(input.latitude, "纬度", -90, 90);
  const altitude = nullableNumber(input.altitude, "高度", -1000, 100000);
  return { longitude, latitude, altitude };
}

function nullableNumber(value: number | null | undefined, label: string, minimum: number, maximum: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new BadRequestException(`${label}无效`);
  }
  return value;
}

async function writeAudit(database: DatabaseService, actor: string, photoId: string, version: number) {
  await database.auditLog.create({
    data: {
      id: `audit-${randomUUID()}`,
      actor,
      action: "taskPhoto.annotation.save",
      targetType: "taskPhoto",
      targetId: photoId,
      summary: `保存照片标注版本 ${version}`,
    },
  });
}
