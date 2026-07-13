import { Global, Module } from "@nestjs/common";
import { AuditController } from "./audit.controller.js";
import { AuditService } from "./audit.service.js";
import { ManagedObjectDeletionService } from "../managed-objects/managed-object-deletion.service.js";

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, ManagedObjectDeletionService],
  exports: [AuditService, ManagedObjectDeletionService],
})
export class AuditModule {}
