import { Module } from "@nestjs/common";
import { ReportUploadService } from "./report-upload.service.js";
import { ReportsController } from "./reports.controller.js";

@Module({
  controllers: [ReportsController],
  providers: [ReportUploadService],
})
export class ReportsModule {}
