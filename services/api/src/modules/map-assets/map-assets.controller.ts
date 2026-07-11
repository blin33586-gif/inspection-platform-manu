import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Query, Res, UnsupportedMediaTypeException, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { access } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { DatabaseService } from "../../database/database.service.js";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { ok, page, paged } from "../../shared/api-response.js";
import { sendInlineStoredFile, sendStoredFile } from "../../shared/file-download.js";
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

  @Post("tile-packages/upload")
  @UseInterceptors(FileInterceptor("file", {
    dest: "storage/map-assets/tmp",
    limits: { fileSize: 1024 * 1024 * 1024 },
  }))
  async uploadTilePackage(@UploadedFile() file: UploadedFileLike | undefined, @Body() body: { name?: string; mapType?: string }) {
    return ok(await this.uploadService.createTilePackageFromUpload(file, body));
  }

  @Get("active")
  async activeTileMap() {
    return ok(await this.readRepository.activeTileMap());
  }

  @Post(":id/publish")
  async publish(@Param("id") id: string) {
    await this.uploadService.publishTileMap(id);
    const item = await this.readRepository.mapAsset(id);
    if (!item) throw new NotFoundException("Map asset not found");
    return ok(item);
  }

  @Get(":id/tiles/:z/:x/:y")
  async tile(@Param("id") id: string, @Param("z") z: string, @Param("x") x: string, @Param("y") y: string, @Res() response: Response) {
    if (![z, x, y].every((part) => /^\d+$/.test(part))) throw new BadRequestException("瓦片坐标无效");
    const item = await this.database.mapAsset.findUnique({ where: { id }, select: { sourceType: true, tilePath: true } });
    if (!item || item.sourceType !== "tile" || !item.tilePath) throw new NotFoundException("瓦片底图不存在");

    const root = resolve(process.cwd(), item.tilePath);
    const filePath = resolve(root, z, x, `${y}.png`);
    if (!filePath.startsWith(`${root}${sep}`)) throw new BadRequestException("瓦片路径无效");
    await access(filePath).catch(() => {
      throw new NotFoundException("瓦片不存在");
    });

    response.type("png");
    response.setHeader("Cache-Control", "public, max-age=604800, immutable");
    return response.sendFile(filePath);
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

  @Get(":id/preview")
  async preview(@Param("id") id: string, @Res() response: Response) {
    const item = await this.database.mapAsset.findUnique({
      where: { id },
      select: { storagePath: true, originalFileName: true, fileName: true, mimeType: true, sourceType: true },
    });
    if (!item) throw new NotFoundException("Map asset not found");
    if (item.sourceType !== "image") throw new UnsupportedMediaTypeException("Only image maps can be previewed directly");
    return sendInlineStoredFile(response, item);
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
      color?: string;
    },
  ) {
    return ok(await this.hotAreaService.create(id, body));
  }

  @Patch(":id/hot-areas/:hotAreaId")
  async updateHotArea(
    @Param("id") id: string,
    @Param("hotAreaId") hotAreaId: string,
    @Body() body: { label?: string; polygon?: string; color?: string },
  ) {
    return ok(await this.hotAreaService.update(id, hotAreaId, body));
  }

  @Delete(":id/hot-areas/:hotAreaId")
  async deleteHotArea(@Param("id") id: string, @Param("hotAreaId") hotAreaId: string) {
    await this.hotAreaService.remove(id, hotAreaId);
    return ok({ id: hotAreaId });
  }
}
