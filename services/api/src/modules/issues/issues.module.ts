import { Module } from "@nestjs/common";
import { IssuesController } from "./issues.controller.js";
import { IssueWriteService } from "./issue-write.service.js";
import { IssueAttachmentService } from "./issue-attachment.service.js";

@Module({
  controllers: [IssuesController],
  providers: [IssueWriteService, IssueAttachmentService],
})
export class IssuesModule {}
