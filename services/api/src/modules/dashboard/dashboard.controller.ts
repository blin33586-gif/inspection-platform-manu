import { Controller, Get, Inject } from "@nestjs/common";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok } from "../../shared/api-response.js";

@Controller("dashboard")
export class DashboardController {
  constructor(@Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository) {}

  @Get("summary")
  async summary() {
    return ok(await this.readRepository.dashboardSummary());
  }

  @Get("issue-distribution")
  async issueDistribution() {
    return ok(await this.readRepository.issueDistribution());
  }

  @Get("top-objects")
  async topObjects() {
    return ok(await this.readRepository.topObjects());
  }

  @Get("map")
  async map() {
    return ok(await this.readRepository.dashboardMap());
  }
}
