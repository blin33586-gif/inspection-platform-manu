import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page } from "../../shared/api-response.js";

@Controller("communities")
export class CommunitiesController {
  constructor(@Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository) {}

  @Get()
  async list() {
    return ok(page(await this.readRepository.managedObjects("community")));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.managedObject(id, "community");
    if (!item) throw new NotFoundException("Community not found");
    return ok(item);
  }

  @Get(":id/issues")
  async communityIssues(@Param("id") id: string) {
    return ok(page(await this.readRepository.issues({ objectId: id })));
  }

  @Get(":id/reports")
  async communityReports(@Param("id") id: string) {
    return ok(page(await this.readRepository.reports({ objectId: id })));
  }
}
