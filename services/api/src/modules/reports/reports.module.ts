import { Module } from "@nestjs/common";
import { ReportUploadService } from "./report-upload.service.js";
import { ReportsController } from "./reports.controller.js";
import { ReportCreateService } from "./report-create.service.js";
import { ReportPdfService } from "./report-pdf.service.js";

@Module({
  controllers: [ReportsController],
  providers: [ReportUploadService, ReportCreateService, ReportPdfService],
})
export class ReportsModule {}
