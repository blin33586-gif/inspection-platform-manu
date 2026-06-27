import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { reports } from "../../shared/mock-data.js";
import { ok, page } from "../../shared/api-response.js";

@Controller("reports")
export class ReportsController {
  @Get()
  list() {
    return ok(page(reports));
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    const item = reports.find((report) => report.id === id);
    if (!item) throw new NotFoundException("Report not found");
    return ok(item);
  }
}
