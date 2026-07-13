import { Inject, Injectable } from "@nestjs/common";
import type { DashboardSummary, IssueStatus, IssueSummary, ManagedObjectSummary, MapAssetSummary, PointSummary, ReportSummary, TileMapMetadata } from "@xunjianbao/shared";
import { DatabaseService } from "./database.service.js";

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class InspectionReadRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async dashboardSummary(): Promise<DashboardSummary> {
    const metrics = await this.database.dashboardMetric.findMany();
    const byKey = new Map(metrics.map((metric) => [metric.key, metric.value]));

    return {
      inspectionsThisMonth: byKey.get("inspectionsThisMonth") ?? 0,
      issuesThisMonth: byKey.get("issuesThisMonth") ?? 0,
      pendingIssues: byKey.get("pendingIssues") ?? 0,
    };
  }

  async issueDistribution() {
    return this.database.issueCategoryStat.findMany({
      orderBy: { sort: "asc" },
      select: { category: true, value: true },
    });
  }

  async topObjects(): Promise<ManagedObjectSummary[]> {
    const objects = await this.database.managedObject.findMany({
      where: { objectType: "community" },
      orderBy: [{ issueCount: "desc" }, { name: "asc" }],
      take: 3,
    });

    return objects.map((object) => this.toManagedObjectSummary(object));
  }

  async managedObjects(objectType: string): Promise<ManagedObjectSummary[]> {
    const objects = await this.database.managedObject.findMany({
      where: { objectType },
      orderBy: [{ issueCount: "desc" }, { name: "asc" }],
    });

    return objects.map((object) => this.toManagedObjectSummary(object));
  }

  async managedObject(id: string, objectType?: string): Promise<ManagedObjectSummary | null> {
    const object = await this.database.managedObject.findUnique({ where: { id } });
    if (objectType && object?.objectType !== objectType) return null;
    return object ? this.toManagedObjectSummary(object) : null;
  }

  async points(): Promise<PointSummary[]> {
    const objects = await this.database.managedObject.findMany({
      where: { objectType: "point" },
      orderBy: [{ issueCount: "desc" }, { name: "asc" }],
    });

    return objects.map((object) => ({
      id: object.id,
      name: object.name,
      pointType: object.objectSubtype ?? "重点点位",
      relatedObjectName: object.parentName ?? "曲阳路街道",
      status: object.status,
      issueCount: object.issueCount,
      reportCount: object.reportCount,
    }));
  }

  async point(id: string): Promise<PointSummary | null> {
    const object = await this.database.managedObject.findUnique({ where: { id } });
    if (!object || object.objectType !== "point") return null;

    return {
      id: object.id,
      name: object.name,
      pointType: object.objectSubtype ?? "重点点位",
      relatedObjectName: object.parentName ?? "曲阳路街道",
      status: object.status,
      issueCount: object.issueCount,
      reportCount: object.reportCount,
    };
  }

  async issues(filters: { objectId?: string; keyword?: string; status?: IssueStatus; category?: string; cardOnly?: boolean; workflowStatus?: "pending" | "processed" } = {}): Promise<IssueSummary[]> {
    const issues = await this.database.issue.findMany({
      where: {
        ...(filters.objectId ? { objectId: filters.objectId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.workflowStatus === "pending" ? { status: "pending" } : {}),
        ...(filters.workflowStatus === "processed" ? { status: { not: "pending" } } : {}),
        ...(filters.cardOnly ? { cardStoragePath: { not: null } } : {}),
        ...(filters.category ? { category: { contains: filters.category } } : {}),
        ...(filters.keyword
          ? {
              OR: [
                { title: { contains: filters.keyword } },
                { category: { contains: filters.keyword } },
                { object: { is: { name: { contains: filters.keyword } } } },
              ],
            }
          : {}),
      },
      include: { object: true },
      orderBy: { foundAt: "desc" },
    });

    return issues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      objectName: issue.object?.name ?? "未关联对象",
      category: issue.category,
      status: issue.status as IssueSummary["status"],
      severity: issue.severity as IssueSummary["severity"],
      foundAt: formatDate(issue.foundAt),
      description: issue.description,
      locationName: issue.locationName,
      cardImageUrl: issue.cardStoragePath ? `/api/v1/issues/${issue.id}/card.png` : null,
    }));
  }

  async issue(id: string): Promise<IssueSummary | null> {
    const issue = await this.database.issue.findUnique({
      where: { id },
      include: { object: true },
    });

    if (!issue) return null;

    return {
      id: issue.id,
      title: issue.title,
      objectName: issue.object?.name ?? "未关联对象",
      category: issue.category,
      status: issue.status as IssueSummary["status"],
      severity: issue.severity as IssueSummary["severity"],
      foundAt: formatDate(issue.foundAt),
      description: issue.description,
      locationName: issue.locationName,
      cardImageUrl: issue.cardStoragePath ? `/api/v1/issues/${issue.id}/card.png` : null,
    };
  }

  async updateIssueStatus(id: string, status: IssueStatus): Promise<IssueSummary | null> {
    const exists = await this.database.issue.findUnique({ where: { id } });
    if (!exists) return null;

    const issue = await this.database.issue.update({
      where: { id },
      data: { status },
      include: { object: true },
    });

    return {
      id: issue.id,
      title: issue.title,
      objectName: issue.object?.name ?? "未关联对象",
      category: issue.category,
      status: issue.status as IssueSummary["status"],
      severity: issue.severity as IssueSummary["severity"],
      foundAt: formatDate(issue.foundAt),
      description: issue.description,
      locationName: issue.locationName,
      cardImageUrl: issue.cardStoragePath ? `/api/v1/issues/${issue.id}/card.png` : null,
    };
  }

  async reports(filters: { objectId?: string; keyword?: string; reportType?: string } = {}): Promise<ReportSummary[]> {
    const reports = await this.database.inspectionReport.findMany({
      where: {
        ...(filters.objectId ? { relatedObjectId: filters.objectId } : {}),
        ...(filters.reportType ? { reportType: filters.reportType } : {}),
        ...(filters.keyword
          ? {
              OR: [
                { title: { contains: filters.keyword } },
                { relatedObjectName: { contains: filters.keyword } },
                { contentSummary: { contains: filters.keyword } },
              ],
            }
          : {}),
      },
      orderBy: { reportDate: "desc" },
    });

    return reports.map((report) => ({
      id: report.id,
      taskId: report.taskId,
      title: report.title,
      reportDate: formatDate(report.reportDate),
      reportType: report.reportType as ReportSummary["reportType"],
      relatedObjectName: report.relatedObjectName,
      issueCount: report.issueCount,
      fileName: report.fileName,
      originalFileName: report.originalFileName,
      mimeType: report.mimeType,
      fileSize: report.fileSize,
      processStatus: report.processStatus,
    }));
  }

  async report(id: string): Promise<ReportSummary | null> {
    const report = await this.database.inspectionReport.findUnique({
      where: { id },
      include: {
        photos: {
          orderBy: { sortIndex: "asc" },
          include: {
            taskPhoto: {
              include: {
                mediaAsset: true,
                annotationDocument: true,
                sourceIssues: {
                  where: { cardStoragePath: { not: null } },
                  orderBy: { updatedAt: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!report) return null;

    return {
      id: report.id,
      taskId: report.taskId,
      taskPhotoIds: report.photos.map((photo) => photo.taskPhotoId),
      title: report.title,
      reportDate: formatDate(report.reportDate),
      reportType: report.reportType as ReportSummary["reportType"],
      relatedObjectName: report.relatedObjectName,
      issueCount: report.issueCount,
      contentSummary: report.contentSummary,
      fileName: report.fileName,
      originalFileName: report.originalFileName,
      mimeType: report.mimeType,
      fileSize: report.fileSize,
      processStatus: report.processStatus,
      photos: report.photos.map(({ taskPhoto }) => {
        const issue = taskPhoto.sourceIssues[0];
        const annotation = taskPhoto.annotationDocument;
        return {
          taskPhotoId: taskPhoto.id,
          mediaAssetId: taskPhoto.mediaAssetId,
          fileName: taskPhoto.mediaAsset.originalFileName,
          capturedAt: taskPhoto.capturedAt?.toISOString() ?? null,
          videoTimestampMs: taskPhoto.videoTimestampMs,
          issueDescription: annotation?.issueDescription ?? issue?.description ?? null,
          latitude: annotation?.latitude ?? taskPhoto.latitude,
          longitude: annotation?.longitude ?? taskPhoto.longitude,
          issueCardId: issue?.id ?? null,
          issueTitle: issue?.title ?? null,
          issueCategory: issue?.category ?? null,
        };
      }),
    };
  }

  async mapAssets(filters: { keyword?: string; mapType?: string; processStatus?: string } = {}) {
    const assets = await this.database.mapAsset.findMany({
      where: {
        ...(filters.mapType ? { mapType: { contains: filters.mapType } } : {}),
        ...(filters.processStatus ? { processStatus: filters.processStatus } : {}),
        ...(filters.keyword
          ? {
              OR: [
                { name: { contains: filters.keyword } },
                { mapType: { contains: filters.keyword } },
                { originalFileName: { contains: filters.keyword } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        mapType: true,
        sourceType: true,
        fileName: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        tileMetadata: true,
        isActive: true,
        processStatus: true,
        hotAreaCount: true,
      },
    });
    return assets.map((asset) => this.toMapAssetSummary(asset));
  }

  async mapAsset(id: string) {
    const asset = await this.database.mapAsset.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        mapType: true,
        sourceType: true,
        fileName: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        tileMetadata: true,
        isActive: true,
        processStatus: true,
        hotAreaCount: true,
      },
    });
    return asset ? this.toMapAssetSummary(asset) : null;
  }

  async activeTileMap() {
    const asset = await this.database.mapAsset.findFirst({
      where: { sourceType: "tile", isActive: true },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        mapType: true,
        sourceType: true,
        fileName: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        tileMetadata: true,
        isActive: true,
        processStatus: true,
        hotAreaCount: true,
      },
    });
    return asset ? this.toMapAssetSummary(asset) : null;
  }

  async mapHotAreas(mapAssetId: string) {
    return this.database.mapHotArea.findMany({
      where: { mapAssetId },
      orderBy: { label: "asc" },
      select: { id: true, label: true, objectType: true, objectId: true, x: true, y: true, width: true, height: true, polygon: true, color: true },
    });
  }

  async dashboardMap() {
    const activeTileMap = await this.activeTileMap();
    const mapAssetId = activeTileMap?.id ?? "map-street-main";
    const hotAreas = await this.mapHotAreas(mapAssetId);
    const issues = await this.issues();

    return {
      mapAssetId,
      activeTileMap,
      hotAreas,
      issues: issues.slice(0, 3),
    };
  }

  private toMapAssetSummary(asset: {
    id: string;
    name: string;
    mapType: string;
    sourceType: string;
    fileName: string | null;
    originalFileName: string | null;
    mimeType: string | null;
    fileSize: number | null;
    tileMetadata: string | null;
    isActive: boolean;
    processStatus: string;
    hotAreaCount: number;
  }): MapAssetSummary {
    return {
      id: asset.id,
      name: asset.name,
      mapType: asset.mapType,
      sourceType: asset.sourceType,
      fileName: asset.fileName,
      originalFileName: asset.originalFileName,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      tileMetadata: this.parseTileMetadata(asset.tileMetadata),
      isActive: asset.isActive,
      processStatus: asset.processStatus,
      hotAreaCount: asset.hotAreaCount,
    };
  }

  private parseTileMetadata(value: string | null): TileMapMetadata | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as TileMapMetadata;
      if (!parsed || !Number.isFinite(parsed.minZoom) || !Number.isFinite(parsed.maxZoom) || !Number.isFinite(parsed.tileCount)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private toManagedObjectSummary(object: {
    id: string;
    name: string;
    objectType: string;
    status: string;
    issueCount: number;
    reportCount: number;
  }): ManagedObjectSummary {
    return {
      id: object.id,
      name: object.name,
      objectType: object.objectType as ManagedObjectSummary["objectType"],
      status: object.status,
      issueCount: object.issueCount,
      reportCount: object.reportCount,
    };
  }
}
