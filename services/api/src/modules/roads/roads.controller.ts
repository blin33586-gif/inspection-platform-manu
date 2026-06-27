import { Body, Controller, Get, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page } from "../../shared/api-response.js";
import { ManagedObjectWriteService } from "../managed-objects/managed-object-write.service.js";

@Controller("roads")
export class RoadsController {
  constructor(
    @Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository,
    @Inject(ManagedObjectWriteService) private readonly writeService: ManagedObjectWriteService,
  ) {}

  @Get()
  async list() {
    return ok(page(await this.readRepository.managedObjects("road")));
  }

  @Post()
  async create(@Body() body: { name?: string; status?: string }) {
    return ok(await this.writeService.create("road", body));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.managedObject(id, "road");
    if (!item) throw new NotFoundException("Road not found");
    return ok(item);
  }

  @Get(":id/issues")
  async roadIssues(@Param("id") id: string) {
    return ok(page(await this.readRepository.issues({ objectId: id })));
  }

  @Get(":id/reports")
  async roadReports(@Param("id") id: string) {
    return ok(page(await this.readRepository.reports({ objectId: id })));
  }
}
