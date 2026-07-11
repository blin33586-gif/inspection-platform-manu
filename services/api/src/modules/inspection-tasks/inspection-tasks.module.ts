import { Module } from "@nestjs/common";
import { InspectionTaskWriteService } from "./inspection-task-write.service.js";
import { InspectionTasksController } from "./inspection-tasks.controller.js";

@Module({
  controllers: [InspectionTasksController],
  providers: [InspectionTaskWriteService],
})
export class InspectionTasksModule {}
