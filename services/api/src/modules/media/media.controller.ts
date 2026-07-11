import { Body, Controller, Get, Headers, Inject, Param, Post, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { ok } from "../../shared/api-response.js";
import { MediaContentService } from "./media-content.service.js";
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
  constructor(
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Inject(MediaContentService) private readonly mediaContentService: MediaContentService,
  ) {}

  @Post("media-assets/upload")
  @UseInterceptors(FileInterceptor("file", {
    dest: "storage/media/tmp",
    limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  }))
  async upload(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() body: { intervalSeconds?: string },
  ) {
    return ok(await this.mediaService.createMediaFromUpload(file, Number(body.intervalSeconds ?? 3)));
  }

  @Get("media-assets/tasks")
  async tasks() {
    return ok(await this.mediaService.listTasks());
  }

  @Get("media-assets/videos")
  async videos() {
    return ok(await this.mediaService.listVideos());
  }

  @Get("media-assets/:id/children")
  async children(@Param("id") id: string) {
    return ok(await this.mediaService.listChildren(id));
  }

  @Get("media-assets/:id/content")
  async content(
    @Param("id") id: string,
    @Headers("range") range: string | undefined,
    @Res() response: Response,
  ) {
    const content = await this.mediaContentService.resolveContent(id, range);
    response.status(content.statusCode);
    Object.entries(content.headers).forEach(([name, value]) => response.setHeader(name, value));
    content.stream.pipe(response);
  }

  @Get("media-assets/:id")
  async asset(@Param("id") id: string) {
    return ok(await this.mediaService.getAsset(id));
  }

  @Post("media-jobs/frame-extraction")
  async createFrames(@Body() body: { mediaId?: string; intervalSeconds?: number }) {
    return ok(await this.mediaService.createFrameExtractionJob(body.mediaId ?? "", body.intervalSeconds ?? 3));
  }

  @Get("media-jobs/:id")
  async job(@Param("id") id: string) {
    return ok(await this.mediaService.jobDetail(id));
  }

  @Post("media-jobs/:id/retry")
  async retry(@Param("id") id: string) {
    return ok(await this.mediaService.retryJob(id));
  }
}
