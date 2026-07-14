import { Module } from "@nestjs/common";
import { IssuesController } from "./issues.controller.js";
import { IssueWriteService } from "./issue-write.service.js";
import { IssueAttachmentService } from "./issue-attachment.service.js";
import { IssueEventController } from "./issue-event.controller.js";
import { IssuePublicController } from "./issue-public.controller.js";
import { IssueEventPublishService } from "./issue-event-publish.service.js";
import { IssuePublicReadService } from "./issue-public-read.service.js";
import { IssueRectificationService } from "./issue-rectification.service.js";

@Module({
  controllers: [IssuesController, IssueEventController, IssuePublicController],
  providers: [IssueWriteService, IssueAttachmentService, IssueEventPublishService, IssuePublicReadService, IssueRectificationService],
})
export class IssuesModule {}
