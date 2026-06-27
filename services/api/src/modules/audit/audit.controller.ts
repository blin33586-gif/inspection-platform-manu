import { Controller, Get, Inject } from "@nestjs/common";
import { ok, page } from "../../shared/api-response.js";
import { AuditService } from "./audit.service.js";

@Controller("audit-logs")
export class AuditController {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  @Get()
  async list() {
    return ok(page(await this.auditService.list()));
  }
}
