import { Module } from "@nestjs/common";
import { MediaContentService } from "./media-content.service.js";
import { MediaController } from "./media.controller.js";
import { MediaService } from "./media.service.js";

@Module({
  controllers: [MediaController],
  providers: [MediaService, MediaContentService],
})
export class MediaModule {}
