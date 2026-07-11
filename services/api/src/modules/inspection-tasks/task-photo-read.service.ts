import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { DatabaseService } from "../../database/database.service.js";

export interface TaskPhotoQuery {
  status?: string;
  page?: string;
  pageSize?: string;
}

@Injectable()
export class TaskPhotoReadService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(query: TaskPhotoQuery) {
    const where: Prisma.TaskPhotoWhereInput = {
      distributionStatus: query.status || "pending",
    };
    return this.findPage(where, query);
  }

  async listForArchive(objectId: string, query: Pick<TaskPhotoQuery, "page" | "pageSize">) {
    const object = await this.database.managedObject.findUnique({
      where: { id: objectId },
      select: { id: true },
    });
    if (!object) throw new NotFoundException("档案对象不存在");

    return this.findPage({
      archiveObjectId: objectId,
      distributionStatus: "archived",
    }, query);
  }

  private async findPage(
    where: Prisma.TaskPhotoWhereInput,
    query: Pick<TaskPhotoQuery, "page" | "pageSize">,
  ) {
    const page = positiveInt(query.page, 1);
    const pageSize = Math.min(positiveInt(query.pageSize, 40), 100);
    const [items, total] = await Promise.all([
      this.database.taskPhoto.findMany({
        where,
        include: {
          mediaAsset: true,
          archiveObject: true,
          task: { select: { id: true, name: true, taskDate: true, sourceType: true } },
        },
        orderBy: [{ capturedAt: "desc" }, { videoTimestampMs: "asc" }, { createdAt: "desc" }],
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
