import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { ReportType } from "@xunjianbao/shared";
import type { Response } from "express";
import { DatabaseService } from "../../database/database.service.js";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, paged } from "../../shared/api-response.js";
import { sendStoredFile } from "../../shared/file-download.js";
import { ReportUploadService } from "./report-upload.service.js";
import { ReportCreateService, type SubmitTaskReportInput } from "./report-create.service.js";
import { ReportPdfService } from "./report-pdf.service.js";
import { currentProjectId } from "../auth/project-context.js";

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
    @Inject(ReportCreateService) private readonly createService: ReportCreateService,
    @Inject(ReportPdfService) private readonly pdfService: ReportPdfService,
  ) {}

  @Get()
  async list(@Query() query: { keyword?: string; reportType?: string; page?: string; pageSize?: string }) {
    return ok(paged(await this.readRepository.reports({
      keyword: query.keyword,
      reportType: query.reportType,
    }), query));
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

  @Post()
  async submit(@Body() body: SubmitTaskReportInput) {
    return ok(await this.createService.submit(body));
  }

  @Get(":id/file")
  async file(@Param("id") id: string, @Res() response: Response) {
    const item = await this.database.inspectionReport.findUnique({
      where: { id, projectId: currentProjectId() },
      select: { storagePath: true, originalFileName: true, fileName: true },
    });
    return sendStoredFile(response, item);
  }

  @Get(":id/pdf")
  async pdf(@Param("id") id: string, @Res() response: Response) {
    const result = await this.pdfService.create(id);
    response.type("application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);
    return response.send(Buffer.from(result.buffer));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.report(id);
    if (!item) throw new NotFoundException("Report not found");
    return ok(item);
  }
}
