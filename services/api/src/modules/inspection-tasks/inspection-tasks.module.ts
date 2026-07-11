import { Module } from "@nestjs/common";
import { InspectionTaskWriteService } from "./inspection-task-write.service.js";
import { InspectionTasksController } from "./inspection-tasks.controller.js";
import { InspectionTaskReadService } from "./inspection-task-read.service.js";
import { InspectionTaskDistributionService } from "./inspection-task-distribution.service.js";
import { TaskPhotoReadService } from "./task-photo-read.service.js";
import { TaskPhotosController } from "./task-photos.controller.js";

@Module({
  controllers: [InspectionTasksController, TaskPhotosController],
  providers: [
    InspectionTaskWriteService,
    InspectionTaskReadService,
    InspectionTaskDistributionService,
    TaskPhotoReadService,
  ],
})
export class InspectionTasksModule {}
