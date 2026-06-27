import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { ReportType } from "@xunjianbao/shared";
import type { Response } from "express";
import { DatabaseService } from "../../database/database.service.js";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page } from "../../shared/api-response.js";
import { sendStoredFile } from "../../shared/file-download.js";
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
    @Inject(DatabaseService) private readonly database: DatabaseService,
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

  @Get(":id/file")
  async file(@Param("id") id: string, @Res() response: Response) {
    const item = await this.database.inspectionReport.findUnique({
      where: { id },
      select: { storagePath: true, originalFileName: true, fileName: true },
    });
    return sendStoredFile(response, item);
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.report(id);
    if (!item) throw new NotFoundException("Report not found");
    return ok(item);
  }
}
