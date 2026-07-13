import type { MapAssetSummary, PageResult } from "@xunjianbao/shared";

type MapProcessingState = Pick<MapAssetSummary, "processStatus" | "isActive">;

export interface MapHistoryRow {
  id: string;
  name: string;
  fileName: string;
  format: string;
  fileSize: number | null;
  uploadedByName: string;
  uploadedAt: string;
  processStatus: string;
  statusLabel: string;
  isActive: boolean;
  errorMessage: string | null;
}

export function mapStatusLabel(map: MapProcessingState) {
  if (map.processStatus === "published" && map.isActive) return "当前使用";
  if (map.processStatus === "published") return "历史版本";
  if (map.processStatus === "queued") return "等待处理";
  if (map.processStatus === "running" || map.processStatus === "processing") return "处理中";
  if (map.processStatus === "failed") return "处理失败";
  return "状态未知";
}

export function isSupportedMapFile(fileName: string) {
  return /\.(?:tif|tiff|zip)$/i.test(fileName);
}

export function formatMapFileSize(bytes: number | null) {
  if (bytes === null || !Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${Number(value.toFixed(1))} ${units[unitIndex]}`;
}

export function shouldPollMapHistory(maps: Array<Pick<MapAssetSummary, "processStatus">>) {
  return maps.some((map) => ["queued", "running", "processing"].includes(map.processStatus));
}

export function mapMapHistoryResponse(history: PageResult<MapAssetSummary>): PageResult<MapHistoryRow> {
  return {
    ...history,
    items: history.items.map((map) => ({
      id: map.id,
      name: map.name,
      fileName: map.originalFileName || map.fileName || "-",
      format: mapFileFormat(map),
      fileSize: map.fileSize ?? null,
      uploadedByName: map.uploadedByName || "-",
      uploadedAt: map.createdAt,
      processStatus: map.processStatus,
      statusLabel: mapStatusLabel(map),
      isActive: map.isActive === true,
      errorMessage: map.errorMessage ?? null,
    })),
  };
}

function mapFileFormat(map: Pick<MapAssetSummary, "originalFileName" | "fileName" | "sourceType">) {
  const fileName = map.originalFileName || map.fileName || "";
  const extension = fileName.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (extension === "tif" || extension === "tiff" || map.sourceType === "tiff") return "TIFF";
  if (extension === "zip" || map.sourceType === "tile") return "ZIP";
  return extension?.toUpperCase() || "-";
}
