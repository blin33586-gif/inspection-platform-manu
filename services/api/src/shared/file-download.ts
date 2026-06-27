import { NotFoundException } from "@nestjs/common";
import type { Response } from "express";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

interface DownloadableFile {
  storagePath: string | null;
  originalFileName: string | null;
  fileName: string | null;
}

export async function sendStoredFile(response: Response, file: DownloadableFile | null) {
  if (!file?.storagePath) throw new NotFoundException("File not found");

  const filePath = resolve(process.cwd(), file.storagePath);
  await access(filePath).catch(() => {
    throw new NotFoundException("File not found");
  });

  const downloadName = file.originalFileName || file.fileName || "download";
  return response.download(filePath, downloadName);
}
