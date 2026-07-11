import { Body, Controller, Get, Inject, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ok } from "../../shared/api-response.js";
import { MediaService } from "./media.service.js";

interface UploadedFileLike {
  filename: string;
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

@Controller()
export class MediaController {
  constructor(@Inject(MediaService) private readonly mediaService: MediaService) {}

  @Post("media-assets/upload")
  @UseInterceptors(FileInterceptor("file", {
    dest: "storage/media/tmp",
    limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  }))
  async uploadVideo(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() body: { intervalSeconds?: string },
  ) {
    return ok(await this.mediaService.createVideoFromUpload(file, Number(body.intervalSeconds ?? 3)));
  }

  @Get("media-assets/videos")
  async videos() {
    return ok(await this.mediaService.listVideos());
  }

  @Post("media-jobs/frame-extraction")
  async createFrames(@Body() body: { mediaId?: string; intervalSeconds?: number }) {
    return ok(await this.mediaService.createFrameExtractionJob(body.mediaId ?? "", body.intervalSeconds ?? 3));
  }

  @Get("media-jobs/:id")
  async job(@Param("id") id: string) {
    return ok(await this.mediaService.jobDetail(id));
  }
}
