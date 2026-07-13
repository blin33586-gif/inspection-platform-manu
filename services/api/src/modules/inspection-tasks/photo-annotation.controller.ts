import { Body, Controller, Get, Inject, Param, Put } from "@nestjs/common";
import { ok } from "../../shared/api-response.js";
import { PhotoAnnotationService, type SavePhotoAnnotationInput } from "./photo-annotation.service.js";

@Controller("task-photos")
export class PhotoAnnotationController {
  constructor(@Inject(PhotoAnnotationService) private readonly annotationService: PhotoAnnotationService) {}

  @Get(":photoId/annotation")
  async current(@Param("photoId") photoId: string) {
    return ok(await this.annotationService.getCurrent(photoId));
  }

  @Get(":photoId/annotation/versions")
  async versions(@Param("photoId") photoId: string) {
    return ok(await this.annotationService.listVersions(photoId));
  }

  @Get(":photoId/annotation/versions/:version")
  async version(@Param("photoId") photoId: string, @Param("version") version: string) {
    return ok(await this.annotationService.getVersion(photoId, Number.parseInt(version, 10)));
  }

  @Put(":photoId/annotation")
  async save(@Param("photoId") photoId: string, @Body() input: SavePhotoAnnotationInput) {
    return ok(await this.annotationService.save(photoId, input));
  }
}
