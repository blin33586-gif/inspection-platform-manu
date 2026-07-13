import { Global, Module } from "@nestjs/common";
import { ManagedObjectArchiveService } from "./managed-object-archive.service.js";
import { ManagedObjectWriteService } from "./managed-object-write.service.js";
import { ManagedObjectsController } from "./managed-objects.controller.js";

@Global()
@Module({
  controllers: [ManagedObjectsController],
  providers: [ManagedObjectArchiveService, ManagedObjectWriteService],
  exports: [ManagedObjectArchiveService, ManagedObjectWriteService],
})
export class ManagedObjectsModule {}
