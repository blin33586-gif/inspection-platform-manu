import { Module } from "@nestjs/common";
import { InspectionTaskWriteService } from "./inspection-task-write.service.js";
import { InspectionTasksController } from "./inspection-tasks.controller.js";
import { InspectionTaskReadService } from "./inspection-task-read.service.js";

@Module({
  controllers: [InspectionTasksController],
  providers: [InspectionTaskWriteService, InspectionTaskReadService],
})
export class InspectionTasksModule {}
