import { Body, Controller, Get, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page } from "../../shared/api-response.js";
import { ManagedObjectWriteService } from "../managed-objects/managed-object-write.service.js";

@Controller("points")
export class PointsController {
  constructor(
    @Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository,
    @Inject(ManagedObjectWriteService) private readonly writeService: ManagedObjectWriteService,
  ) {}

  @Get()
  async list() {
    return ok(page(await this.readRepository.points()));
  }

  @Post()
  async create(@Body() body: { name?: string; status?: string; pointType?: string; relatedObjectName?: string }) {
    return ok(await this.writeService.create("point", {
      name: body.name,
      status: body.status,
      objectSubtype: body.pointType,
      parentName: body.relatedObjectName,
    }));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.point(id);
    if (!item) throw new NotFoundException("Point not found");
    return ok(item);
  }

  @Get(":id/issues")
  async pointIssues(@Param("id") id: string) {
    return ok(page(await this.readRepository.issues({ objectId: id })));
  }

  @Get(":id/reports")
  async pointReports(@Param("id") id: string) {
    return ok(page(await this.readRepository.reports({ objectId: id })));
  }
}
