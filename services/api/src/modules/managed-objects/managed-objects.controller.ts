import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok } from "../../shared/api-response.js";
import { ManagedObjectArchiveService } from "./managed-object-archive.service.js";
import { ManagedObjectDeletionService } from "./managed-object-deletion.service.js";

@Controller("managed-objects")
export class ManagedObjectsController {
  constructor(
    @Inject(ManagedObjectDeletionService) private readonly deletionService: ManagedObjectDeletionService,
    @Inject(ManagedObjectArchiveService) private readonly archiveService: ManagedObjectArchiveService,
    @Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository,
  ) {}

  @Get()
  async list() {
    return ok(await this.readRepository.allManagedObjects());
  }

  @Get(":id/archive-overview")
  async archiveOverview(@Param("id") id: string) {
    return ok(await this.archiveService.overview(id));
  }

  @Post(":id/deletion-requests")
  async requestDeletion(@Param("id") id: string) {
    return ok(await this.deletionService.requestDeletion(id));
  }
}
