import {
  MAP_PROCESSING_FAILURE_FALLBACK,
  normalizeMapAssetProcessStatus,
  sanitizeMapProcessingFailureMessage,
  type MapAssetPageResult,
  type MapAssetSummary,
  type PageResult,
} from "@xunjianbao/shared";

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
  const status = normalizeMapAssetProcessStatus(map.processStatus);
  if (status === "published" && map.isActive) return "当前使用";
  if (status === "published") return "历史版本";
  if (status === "queued") return "等待处理";
  if (status === "running") return "处理中";
  return "处理失败";
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

export function shouldPollMapHistory(history: {
  hasProcessing: boolean;
  items: Array<Pick<MapAssetSummary, "processStatus">>;
}) {
  return history.hasProcessing;
}

export function presentMapFailureReason(value: string | null | undefined) {
  return sanitizeMapProcessingFailureMessage(value ?? MAP_PROCESSING_FAILURE_FALLBACK);
}

export class MapUploadRequestGate {
  private current: AbortController | null = null;

  tryStart() {
    if (this.current) return null;
    this.current = new AbortController();
    return this.current;
  }

  finish(controller: AbortController) {
    if (this.current !== controller) return false;
    this.current = null;
    return true;
  }

  abortCurrent() {
    const current = this.current;
    this.current = null;
    current?.abort();
  }
}

export function mapMapHistoryResponse(history: MapAssetPageResult): PageResult<MapHistoryRow> & { hasProcessing: boolean } {
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
      processStatus: normalizeMapAssetProcessStatus(map.processStatus),
      statusLabel: mapStatusLabel(map),
      isActive: map.isActive === true,
      errorMessage: map.processStatus === "failed" ? presentMapFailureReason(map.errorMessage) : null,
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
