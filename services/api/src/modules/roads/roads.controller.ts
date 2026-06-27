import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page } from "../../shared/api-response.js";

@Controller("roads")
export class RoadsController {
  constructor(@Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository) {}

  @Get()
  async list() {
    return ok(page(await this.readRepository.managedObjects("road")));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.managedObject(id, "road");
    if (!item) throw new NotFoundException("Road not found");
    return ok(item);
  }

  @Get(":id/issues")
  async roadIssues(@Param("id") id: string) {
    return ok(page(await this.readRepository.issues(id)));
  }

  @Get(":id/reports")
  async roadReports(@Param("id") id: string) {
    return ok(page(await this.readRepository.reports(id)));
  }
}
