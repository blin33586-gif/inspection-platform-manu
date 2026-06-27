import { Module } from "@nestjs/common";
import { MapAssetsController } from "./map-assets.controller.js";
import { MapHotAreaService } from "./map-hot-area.service.js";
import { MapAssetUploadService } from "./map-asset-upload.service.js";

@Module({
  controllers: [MapAssetsController],
  providers: [MapAssetUploadService, MapHotAreaService],
})
export class MapAssetsModule {}
