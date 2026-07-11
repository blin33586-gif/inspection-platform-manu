import {
  Inject,
  HttpException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { createReadStream, type ReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { DatabaseService } from "../../database/database.service.js";

export interface MediaContentResponse {
  statusCode: 200 | 206;
  headers: Record<string, string | number>;
  stream: ReadStream;
}

@Injectable()
export class MediaContentService {
  private readonly storageRoot: string;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject("MEDIA_STORAGE_ROOT") storageRoot?: string,
  ) {
    this.storageRoot = resolve(storageRoot ?? resolve(process.cwd(), "storage"));
  }

  async resolveContent(id: string, rangeHeader: string | undefined): Promise<MediaContentResponse> {
    const asset = await this.database.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException("媒体素材不存在");

    const filePath = this.resolveStoragePath(asset.storagePath);
    let fileSize: number;
    try {
      fileSize = (await stat(filePath)).size;
    } catch {
      throw new NotFoundException("媒体文件不存在");
    }

    const range = parseByteRange(rangeHeader, fileSize);
    const commonHeaders: Record<string, string | number> = {
      "Content-Type": asset.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.originalFileName)}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=300",
    };

    if (!range) {
      return {
        statusCode: 200,
        headers: { ...commonHeaders, "Content-Length": fileSize },
        stream: createReadStream(filePath),
      };
    }

    return {
      statusCode: 206,
      headers: {
        ...commonHeaders,
        "Content-Length": range.length,
        "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
      },
      stream: createReadStream(filePath, { start: range.start, end: range.end }),
    };
  }

  private resolveStoragePath(storedPath: string) {
    const normalized = storedPath.replace(/^storage[/\\]/, "");
    const filePath = resolve(this.storageRoot, normalized);
    const relativePath = relative(this.storageRoot, filePath);
    if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new NotFoundException("媒体文件路径无效");
    }
    return filePath;
  }
}

export function parseByteRange(header: string | undefined, fileSize: number) {
  if (!header) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) throw new HttpException("请求范围无效", 416);

  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), fileSize - 1) : fileSize - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= fileSize) {
    throw new HttpException("请求范围无效", 416);
  }
  return { start, end, length: end - start + 1 };
}
