import { Body, Controller, Inject, Param, Post } from "@nestjs/common";
import { ok } from "../../shared/api-response.js";
import { IssueEventPublishService } from "./issue-event-publish.service.js";
import type { PublishIssueEventInput } from "./issue-event-publish.types.js";

@Controller("task-photos")
export class IssueEventController {
  constructor(@Inject(IssueEventPublishService) private readonly publisher: IssueEventPublishService) {}
  @Post(":photoId/publish-issue") publish(@Param("photoId") photoId: string, @Body() body: PublishIssueEventInput) { return this.publisher.publish(photoId, "admin", body).then(ok); }
}
