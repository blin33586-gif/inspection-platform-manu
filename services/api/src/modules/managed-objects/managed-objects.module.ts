import { Global, Module } from "@nestjs/common";
import { ManagedObjectWriteService } from "./managed-object-write.service.js";
import { ManagedObjectsController } from "./managed-objects.controller.js";

@Global()
@Module({
  controllers: [ManagedObjectsController],
  providers: [ManagedObjectWriteService],
  exports: [ManagedObjectWriteService],
})
export class ManagedObjectsModule {}
