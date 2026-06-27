import { Controller, Get } from "@nestjs/common";
import { communities, dashboardSummary, issues } from "../../shared/mock-data.js";
import { ok } from "../../shared/api-response.js";

@Controller("dashboard")
export class DashboardController {
  @Get("summary")
  summary() {
    return ok(dashboardSummary);
  }

  @Get("issue-distribution")
  issueDistribution() {
    return ok([
      { category: "飞线整治", value: 32 },
      { category: "占道经营", value: 26 },
      { category: "违建隐患", value: 18 },
      { category: "绿化河道", value: 14 },
    ]);
  }

  @Get("top-objects")
  topObjects() {
    return ok(communities.slice(0, 3));
  }

  @Get("map")
  map() {
    return ok({
      mapAssetId: "map-street-main",
      hotAreas: [
        { id: "ha-yutian", objectType: "community", objectId: "c-yutian", label: "玉田新村" },
        { id: "ha-quyang", objectType: "road", objectId: "r-quyang", label: "曲阳路" },
      ],
      issues: issues.slice(0, 3),
    });
  }
}
