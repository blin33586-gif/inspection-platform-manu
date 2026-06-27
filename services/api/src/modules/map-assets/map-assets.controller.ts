import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { DatabaseService } from "../../database/database.service.js";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page, paged } from "../../shared/api-response.js";
import { sendStoredFile } from "../../shared/file-download.js";
import { MapAssetUploadService } from "./map-asset-upload.service.js";
import { MapHotAreaService } from "./map-hot-area.service.js";

interface UploadedFileLike {
  filename: string;
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

@Controller("map-assets")
export class MapAssetsController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository,
    @Inject(MapAssetUploadService) private readonly uploadService: MapAssetUploadService,
    @Inject(MapHotAreaService) private readonly hotAreaService: MapHotAreaService,
  ) {}

  @Get()
  async list(@Query() query: { keyword?: string; mapType?: string; processStatus?: string; page?: string; pageSize?: string }) {
    return ok(paged(await this.readRepository.mapAssets({
      keyword: query.keyword,
      mapType: query.mapType,
      processStatus: query.processStatus,
    }), query));
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file", {
    dest: "storage/map-assets/tmp",
    limits: { fileSize: 200 * 1024 * 1024 },
  }))
  async upload(@UploadedFile() file: UploadedFileLike | undefined, @Body() body: { name?: string; mapType?: string }) {
    return ok(await this.uploadService.createFromUpload(file, body));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.mapAsset(id);
    if (!item) throw new NotFoundException("Map asset not found");
    return ok(item);
  }

  @Get(":id/file")
  async file(@Param("id") id: string, @Res() response: Response) {
    const item = await this.database.mapAsset.findUnique({
      where: { id },
      select: { storagePath: true, originalFileName: true, fileName: true },
    });
    return sendStoredFile(response, item);
  }

  @Get(":id/hot-areas")
  async hotAreas(@Param("id") id: string) {
    return ok(page(await this.readRepository.mapHotAreas(id)));
  }

  @Post(":id/hot-areas")
  async createHotArea(
    @Param("id") id: string,
    @Body() body: {
      label?: string;
      objectType?: "community" | "road" | "point" | "street";
      objectId?: string;
      x?: string;
      y?: string;
      width?: string;
      height?: string;
      polygon?: string;
    },
  ) {
    return ok(await this.hotAreaService.create(id, body));
  }
}
