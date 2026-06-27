import { Module } from "@nestjs/common";
import { PointsController } from "./points.controller.js";

@Module({
  controllers: [PointsController],
})
export class PointsModule {}
