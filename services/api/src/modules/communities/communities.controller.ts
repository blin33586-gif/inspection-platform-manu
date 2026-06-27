import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { communities, issues, reports } from "../../shared/mock-data.js";
import { ok, page } from "../../shared/api-response.js";

@Controller("communities")
export class CommunitiesController {
  @Get()
  list() {
    return ok(page(communities));
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    const item = communities.find((community) => community.id === id);
    if (!item) throw new NotFoundException("Community not found");
    return ok(item);
  }

  @Get(":id/issues")
  communityIssues(@Param("id") id: string) {
    const item = communities.find((community) => community.id === id);
    return ok(page(issues.filter((issue) => issue.objectName === item?.name)));
  }

  @Get(":id/reports")
  communityReports(@Param("id") id: string) {
    const item = communities.find((community) => community.id === id);
    return ok(page(reports.filter((report) => report.relatedObjectName === item?.name)));
  }
}
