import { Inject, Injectable } from "@nestjs/common";
import type { DashboardSummary, IssueStatus, IssueSummary, ManagedObjectSummary, ReportSummary } from "@xunjianbao/shared";
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

  async points() {
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
    }));
  }

  async point(id: string) {
    const object = await this.database.managedObject.findUnique({ where: { id } });
    if (!object || object.objectType !== "point") return null;

    return {
      id: object.id,
      name: object.name,
      pointType: object.objectSubtype ?? "重点点位",
      relatedObjectName: object.parentName ?? "曲阳路街道",
      status: object.status,
      issueCount: object.issueCount,
    };
  }

  async issues(objectId?: string): Promise<IssueSummary[]> {
    const issues = await this.database.issue.findMany({
      where: objectId ? { objectId } : undefined,
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
    };
  }

  async reports(objectId?: string): Promise<ReportSummary[]> {
    const reports = await this.database.inspectionReport.findMany({
      where: objectId ? { relatedObjectId: objectId } : undefined,
      orderBy: { reportDate: "desc" },
    });

    return reports.map((report) => ({
      id: report.id,
      title: report.title,
      reportDate: formatDate(report.reportDate),
      reportType: report.reportType as ReportSummary["reportType"],
      relatedObjectName: report.relatedObjectName,
      issueCount: report.issueCount,
    }));
  }

  async report(id: string): Promise<ReportSummary | null> {
    const report = await this.database.inspectionReport.findUnique({ where: { id } });
    if (!report) return null;

    return {
      id: report.id,
      title: report.title,
      reportDate: formatDate(report.reportDate),
      reportType: report.reportType as ReportSummary["reportType"],
      relatedObjectName: report.relatedObjectName,
      issueCount: report.issueCount,
    };
  }

  async mapAssets() {
    return this.database.mapAsset.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, mapType: true, processStatus: true, hotAreaCount: true },
    });
  }

  async mapAsset(id: string) {
    return this.database.mapAsset.findUnique({
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
        processStatus: true,
        hotAreaCount: true,
      },
    });
  }

  async mapHotAreas(mapAssetId: string) {
    return this.database.mapHotArea.findMany({
      where: { mapAssetId },
      orderBy: { label: "asc" },
      select: { id: true, label: true, objectType: true, objectId: true, x: true, y: true, width: true, height: true, polygon: true },
    });
  }

  async dashboardMap() {
    const hotAreas = await this.mapHotAreas("map-street-main");
    const issues = await this.issues();

    return {
      mapAssetId: "map-street-main",
      hotAreas: hotAreas.slice(0, 3),
      issues: issues.slice(0, 3),
    };
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
