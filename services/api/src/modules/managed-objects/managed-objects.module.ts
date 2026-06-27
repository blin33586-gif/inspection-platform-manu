import { Global, Module } from "@nestjs/common";
import { ManagedObjectWriteService } from "./managed-object-write.service.js";

@Global()
@Module({
  providers: [ManagedObjectWriteService],
  exports: [ManagedObjectWriteService],
})
export class ManagedObjectsModule {}
