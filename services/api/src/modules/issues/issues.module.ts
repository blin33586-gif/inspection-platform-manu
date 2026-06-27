import { Module } from "@nestjs/common";
import { IssuesController } from "./issues.controller.js";
import { IssueWriteService } from "./issue-write.service.js";

@Module({
  controllers: [IssuesController],
  providers: [IssueWriteService],
})
export class IssuesModule {}
