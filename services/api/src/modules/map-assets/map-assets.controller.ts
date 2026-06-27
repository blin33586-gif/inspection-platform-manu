import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page } from "../../shared/api-response.js";

@Controller("map-assets")
export class MapAssetsController {
  constructor(@Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository) {}

  @Get()
  async list() {
    return ok(page(await this.readRepository.mapAssets()));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.mapAsset(id);
    if (!item) throw new NotFoundException("Map asset not found");
    return ok(item);
  }

  @Get(":id/hot-areas")
  async hotAreas(@Param("id") id: string) {
    return ok(page(await this.readRepository.mapHotAreas(id)));
  }
}
