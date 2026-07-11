import { Body, Controller, Get, Inject, Param, Post, Query, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ok } from "../../shared/api-response.js";
import type { InspectionTaskInputBody, TaskUploadFile } from "./inspection-task-input.js";
import { InspectionTaskWriteService } from "./inspection-task-write.service.js";
import { InspectionTaskReadService, type InspectionTaskQuery } from "./inspection-task-read.service.js";

@Controller("inspection-tasks")
export class InspectionTasksController {
  constructor(
    @Inject(InspectionTaskWriteService) private readonly writeService: InspectionTaskWriteService,
    @Inject(InspectionTaskReadService) private readonly readService: InspectionTaskReadService,
  ) {}

  @Get()
  async list(@Query() query: InspectionTaskQuery) {
    return ok(await this.readService.list(query));
  }

  @Post()
  @UseInterceptors(FilesInterceptor("files", 500, {
    dest: "storage/media/tmp",
    limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  }))
  async create(
    @UploadedFiles() files: TaskUploadFile[] | undefined,
    @Body() body: InspectionTaskInputBody,
  ) {
    return ok(await this.writeService.create(body, files));
  }

  @Get(":id/photos")
  async photos(
    @Param("id") id: string,
    @Query() query: { status?: string; page?: string; pageSize?: string },
  ) {
    return ok(await this.readService.photos(id, query));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    return ok(await this.readService.detail(id));
  }
}
