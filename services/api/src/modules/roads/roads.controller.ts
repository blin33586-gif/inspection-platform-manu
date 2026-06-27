import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { issues, reports, roads } from "../../shared/mock-data.js";
import { ok, page } from "../../shared/api-response.js";

@Controller("roads")
export class RoadsController {
  @Get()
  list() {
    return ok(page(roads));
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    const item = roads.find((road) => road.id === id);
    if (!item) throw new NotFoundException("Road not found");
    return ok(item);
  }

  @Get(":id/issues")
  roadIssues(@Param("id") id: string) {
    const item = roads.find((road) => road.id === id);
    return ok(page(issues.filter((issue) => issue.objectName === item?.name)));
  }

  @Get(":id/reports")
  roadReports(@Param("id") id: string) {
    const item = roads.find((road) => road.id === id);
    return ok(page(reports.filter((report) => report.relatedObjectName === item?.name)));
  }
}
