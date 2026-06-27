import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch } from "@nestjs/common";
import type { IssueStatus } from "@xunjianbao/shared";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page } from "../../shared/api-response.js";

const allowedStatuses: IssueStatus[] = ["pending", "processing", "rectified", "verified", "ignored", "archived"];

@Controller("issues")
export class IssuesController {
  constructor(@Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository) {}

  @Get()
  async list() {
    return ok(page(await this.readRepository.issues()));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.issue(id);
    if (!item) throw new NotFoundException("Issue not found");
    return ok(item);
  }

  @Patch(":id/status")
  async updateStatus(@Param("id") id: string, @Body() body: { status?: IssueStatus }) {
    if (!body.status || !allowedStatuses.includes(body.status)) {
      throw new BadRequestException("Invalid issue status");
    }

    const item = await this.readRepository.updateIssueStatus(id, body.status);
    if (!item) throw new NotFoundException("Issue not found");
    return ok(item);
  }
}
