import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { ok } from "../../shared/api-response.js";
import { TaskPhotoReadService, type TaskPhotoQuery } from "./task-photo-read.service.js";

@Controller()
export class TaskPhotosController {
  constructor(@Inject(TaskPhotoReadService) private readonly readService: TaskPhotoReadService) {}

  @Get("task-photos")
  async list(@Query() query: TaskPhotoQuery) {
    return ok(await this.readService.list(query));
  }

  @Get("managed-objects/:objectId/photos")
  async archivePhotos(
    @Param("objectId") objectId: string,
    @Query() query: Pick<TaskPhotoQuery, "page" | "pageSize">,
  ) {
    return ok(await this.readService.listForArchive(objectId, query));
  }
}
