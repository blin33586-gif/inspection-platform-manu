import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page } from "../../shared/api-response.js";

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
}
