import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
import { InspectionReadRepository } from "./inspection-read.repository.js";

@Global()
@Module({
  providers: [DatabaseService, InspectionReadRepository],
  exports: [DatabaseService, InspectionReadRepository],
})
export class DatabaseModule {}
