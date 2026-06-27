import { Module } from "@nestjs/common";
import { CommunitiesController } from "./communities.controller.js";

@Module({
  controllers: [CommunitiesController],
})
export class CommunitiesModule {}
