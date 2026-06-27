import { Module } from "@nestjs/common";
import { RoadsController } from "./roads.controller.js";

@Module({
  controllers: [RoadsController],
})
export class RoadsModule {}
