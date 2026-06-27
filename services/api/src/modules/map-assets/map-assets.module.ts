import { Module } from "@nestjs/common";
import { MapAssetsController } from "./map-assets.controller.js";
import { MapAssetUploadService } from "./map-asset-upload.service.js";

@Module({
  controllers: [MapAssetsController],
  providers: [MapAssetUploadService],
})
export class MapAssetsModule {}
