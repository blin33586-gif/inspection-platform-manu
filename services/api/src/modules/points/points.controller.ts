import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { points } from "../../shared/mock-data.js";
import { ok, page } from "../../shared/api-response.js";

@Controller("points")
export class PointsController {
  @Get()
  list() {
    return ok(page(points));
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    const item = points.find((point) => point.id === id);
    if (!item) throw new NotFoundException("Point not found");
    return ok(item);
  }
}
