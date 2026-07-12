import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { DatabaseService } from "../../database/database.service.js";

export interface InspectionTaskQuery {
  keyword?: string;
  sourceType?: string;
  processStatus?: string;
  uploadStart?: string;
  uploadEnd?: string;
  page?: string;
  pageSize?: string;
}

export function buildInspectionTaskWhere(query: InspectionTaskQuery): Prisma.InspectionTaskWhereInput {
  const conditions: Prisma.InspectionTaskWhereInput[] = [];
  const keyword = query.keyword?.trim();
  if (keyword) {
    conditions.push({
      OR: [
        { name: { contains: keyword } },
        { sourceMedia: { originalFileName: { contains: keyword } } },
      ],
    });
  }
  if (query.sourceType) conditions.push({ sourceType: query.sourceType });
  if (query.processStatus) conditions.push({ processStatus: query.processStatus });

  const dateRange: Prisma.DateTimeFilter = {};
  if (isDate(query.uploadStart)) dateRange.gte = new Date(`${query.uploadStart}T00:00:00+08:00`);
  if (isDate(query.uploadEnd)) dateRange.lte = new Date(`${query.uploadEnd}T23:59:59.999+08:00`);
  if (dateRange.gte || dateRange.lte) conditions.push({ createdAt: dateRange });

  return conditions.length ? { AND: conditions } : {};
}

@Injectable()
export class InspectionTaskReadService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(query: InspectionTaskQuery) {
    const where = buildInspectionTaskWhere(query);
    const page = positiveInt(query.page, 1);
    const pageSize = Math.min(positiveInt(query.pageSize, 20), 100);
    const [items, total, processingTaskCount, pendingPhotoCount, generatedReportCount] = await Promise.all([
      this.database.inspectionTask.findMany({
        where,
        include: {
          sourceMedia: {
            include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
          },
          photos: {
            take: 1,
            orderBy: [{ videoTimestampMs: "asc" }, { createdAt: "asc" }],
            include: { mediaAsset: true },
          },
          report: { select: { id: true, processStatus: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.inspectionTask.count({ where }),
      this.database.inspectionTask.count({
        where: { AND: [where, { processStatus: { in: ["queued", "running"] } }] },
      }),
      this.database.taskPhoto.count({
        where: { distributionStatus: "pending", task: { is: where } },
      }),
      this.database.inspectionReport.count({
        where: { task: { is: where } },
      }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      stats: { taskCount: total, processingTaskCount, pendingPhotoCount, generatedReportCount },
    };
  }

  async detail(id: string) {
    const task = await this.database.inspectionTask.findUnique({
      where: { id },
      include: {
        sourceMedia: {
          include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
        report: true,
      },
    });
    if (!task) throw new NotFoundException("任务不存在");
    return task;
  }

  async photos(id: string, query: { status?: string; page?: string; pageSize?: string }) {
    const task = await this.database.inspectionTask.findUnique({ where: { id }, select: { id: true } });
    if (!task) throw new NotFoundException("任务不存在");

    const page = positiveInt(query.page, 1);
    const pageSize = Math.min(positiveInt(query.pageSize, 40), 100);
    const where: Prisma.TaskPhotoWhereInput = {
      taskId: id,
      ...(query.status ? { distributionStatus: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.database.taskPhoto.findMany({
        where,
        include: { mediaAsset: true, archiveObject: true },
        orderBy: [{ videoTimestampMs: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.taskPhoto.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
