export interface ReportMediaAssetRecord {
  id: string;
  kind: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface PersistedReportPhoto {
  id: number;
  label: string;
  state: "待标注";
  variant: "persisted";
  url: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
}

export function toReportPhoto(
  asset: ReportMediaAssetRecord,
  id: number,
  contentUrl: string,
): PersistedReportPhoto {
  if (asset.kind !== "frame" && asset.kind !== "image") throw new Error("仅支持图片素材进入报告");
  return {
    id,
    label: asset.originalFileName,
    state: "待标注",
    variant: "persisted",
    url: contentUrl,
    fileName: asset.originalFileName,
    fileSize: asset.fileSize,
    uploadedAt: new Date(asset.createdAt).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    }),
  };
}
