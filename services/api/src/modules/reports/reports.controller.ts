import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page } from "../../shared/api-response.js";

@Controller("reports")
export class ReportsController {
  constructor(@Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository) {}

  @Get()
  async list() {
    return ok(page(await this.readRepository.reports()));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.report(id);
    if (!item) throw new NotFoundException("Report not found");
    return ok(item);
  }
}
