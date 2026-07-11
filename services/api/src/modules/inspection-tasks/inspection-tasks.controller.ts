import { Body, Controller, Inject, Post, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ok } from "../../shared/api-response.js";
import type { InspectionTaskInputBody, TaskUploadFile } from "./inspection-task-input.js";
import { InspectionTaskWriteService } from "./inspection-task-write.service.js";

@Controller("inspection-tasks")
export class InspectionTasksController {
  constructor(@Inject(InspectionTaskWriteService) private readonly writeService: InspectionTaskWriteService) {}

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
}
