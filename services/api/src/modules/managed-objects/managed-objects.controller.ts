import { Body, Controller, Inject, Param, Post } from "@nestjs/common";
import { ok } from "../../shared/api-response.js";
import { ManagedObjectDeletionService } from "./managed-object-deletion.service.js";

@Controller("managed-objects")
export class ManagedObjectsController {
  constructor(@Inject(ManagedObjectDeletionService) private readonly deletionService: ManagedObjectDeletionService) {}

  @Post(":id/deletion-requests")
  async requestDeletion(@Param("id") id: string, @Body() body: { actor?: string }) {
    return ok(await this.deletionService.requestDeletion(id, body.actor));
  }
}
