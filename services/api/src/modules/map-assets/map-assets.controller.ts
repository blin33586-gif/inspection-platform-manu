import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { mapAssets } from "../../shared/mock-data.js";
import { ok, page } from "../../shared/api-response.js";

@Controller("map-assets")
export class MapAssetsController {
  @Get()
  list() {
    return ok(page(mapAssets));
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    const item = mapAssets.find((asset) => asset.id === id);
    if (!item) throw new NotFoundException("Map asset not found");
    return ok(item);
  }

  @Get(":id/hot-areas")
  hotAreas(@Param("id") id: string) {
    return ok(page([
      { id: `${id}-ha-community`, label: "玉田新村", objectType: "community", objectId: "c-yutian" },
      { id: `${id}-ha-road`, label: "曲阳路", objectType: "road", objectId: "r-quyang" },
    ]));
  }
}
