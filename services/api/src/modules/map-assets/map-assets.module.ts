import { Module } from "@nestjs/common";
import { MapAssetsController } from "./map-assets.controller.js";

@Module({
  controllers: [MapAssetsController],
})
export class MapAssetsModule {}
