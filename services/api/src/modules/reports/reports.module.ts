import { Module } from "@nestjs/common";
import { ReportUploadService } from "./report-upload.service.js";
import { ReportsController } from "./reports.controller.js";
import { ReportCreateService } from "./report-create.service.js";

@Module({
  controllers: [ReportsController],
  providers: [ReportUploadService, ReportCreateService],
})
export class ReportsModule {}
