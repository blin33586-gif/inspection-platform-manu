import { Body, Controller, Get, Inject, Param, Patch, Query } from "@nestjs/common";
import { ok, paged } from "../../shared/api-response.js";
import { AuditService } from "./audit.service.js";
import { ManagedObjectDeletionService } from "../managed-objects/managed-object-deletion.service.js";

@Controller("audit-logs")
export class AuditController {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ManagedObjectDeletionService) private readonly deletionService: ManagedObjectDeletionService,
  ) {}

  @Get()
  async list(@Query() query: { keyword?: string; action?: string; targetType?: string; page?: string; pageSize?: string }) {
    return ok(paged(await this.auditService.list(query), query));
  }

  @Patch(":id/review")
  async review(@Param("id") id: string, @Body() body: { decision?: "confirm" | "cancel"; actor?: string }) {
    return ok(await this.deletionService.reviewDeletion(id, body.decision ?? "cancel", body.actor));
  }
}
