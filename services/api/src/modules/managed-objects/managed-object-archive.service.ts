import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ManagedObjectArchiveOverview,
  Severity,
} from "@xunjianbao/shared";
import { DatabaseService } from "../../database/database.service.js";
import { currentProjectId } from "../auth/project-context.js";

const sourceLabels: Record<string, string> = {
  drone: "无人机",
  camera: "摄像头",
  glasses: "AI眼镜",
  manual: "人工上传",
};

function isOpenIssue(status: string) {
  return status === "pending";
}

function sourceLabel(sourceType?: string | null) {
  if (!sourceType) return "问题推送";
  return sourceLabels[sourceType] ?? sourceType;
}

@Injectable()
export class ManagedObjectArchiveService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async overview(objectId: string): Promise<ManagedObjectArchiveOverview> {
    const projectId = currentProjectId();
    const [object, records, reportCount] = await Promise.all([
      this.database.managedObject.findUnique({
        where: { id: objectId, projectId },
        select: { id: true },
      }),
      this.database.issue.findMany({
        where: { projectId, objectId },
        orderBy: [{ foundAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          severity: true,
          foundAt: true,
          updatedAt: true,
          sourceTaskPhoto: {
            select: {
              task: { select: { sourceType: true } },
            },
          },
        },
      }),
      this.database.inspectionReport.count({ where: { projectId, relatedObjectId: objectId } }),
    ]);

    if (!object) throw new NotFoundException("Managed object not found");

    const issues = records.map((issue) => {
      const open = isOpenIssue(issue.status);
      return {
        id: issue.id,
        title: issue.title,
        category: issue.category,
        severity: issue.severity as Severity,
        state: open ? "open" as const : "completed" as const,
        stateLabel: open ? "未闭环" as const : "已完成" as const,
        foundAt: issue.foundAt.toISOString(),
        updatedAt: issue.updatedAt.toISOString(),
        sourceLabel: sourceLabel(issue.sourceTaskPhoto?.task.sourceType),
      };
    });
    const openIssues = issues.filter((issue) => issue.state === "open").length;
    return {
      objectId,
      totalIssues: issues.length,
      openIssues,
      completedIssues: issues.length - openIssues,
      reportCount,
      latestInspectionAt: issues[0]?.foundAt ?? null,
      latestInspectionSource: issues[0]?.sourceLabel ?? null,
      issues,
    };
  }
}
