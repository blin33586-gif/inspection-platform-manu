import { Body, Controller, Get, Inject, NotFoundException, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { ReportType } from "@xunjianbao/shared";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page } from "../../shared/api-response.js";
import { ReportUploadService } from "./report-upload.service.js";

interface UploadedFileLike {
  filename: string;
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

@Controller("reports")
export class ReportsController {
  constructor(
    @Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository,
    @Inject(ReportUploadService) private readonly uploadService: ReportUploadService,
  ) {}

  @Get()
  async list() {
    return ok(page(await this.readRepository.reports()));
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file", {
    dest: "storage/reports/tmp",
    limits: { fileSize: 200 * 1024 * 1024 },
  }))
  async upload(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() body: {
      title?: string;
      reportDate?: string;
      reportType?: ReportType;
      relatedObjectName?: string;
      issueCount?: string;
      contentSummary?: string;
    },
  ) {
    return ok(await this.uploadService.createFromUpload(file, body));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.report(id);
    if (!item) throw new NotFoundException("Report not found");
    return ok(item);
  }
}
