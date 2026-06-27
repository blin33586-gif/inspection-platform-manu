import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page } from "../../shared/api-response.js";

@Controller("points")
export class PointsController {
  constructor(@Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository) {}

  @Get()
  async list() {
    return ok(page(await this.readRepository.points()));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.point(id);
    if (!item) throw new NotFoundException("Point not found");
    return ok(item);
  }
}
