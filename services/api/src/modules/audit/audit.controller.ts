import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ok, paged } from "../../shared/api-response.js";
import { AuditService } from "./audit.service.js";

@Controller("audit-logs")
export class AuditController {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  @Get()
  async list(@Query() query: { keyword?: string; action?: string; targetType?: string; page?: string; pageSize?: string }) {
    return ok(paged(await this.auditService.list(query), query));
  }
}
