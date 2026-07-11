import { toMediaTaskViewModel, type MediaTaskRecord } from "./media-task-adapter";

export interface MediaTaskDetail {
  id: string;
  assetKind: "video" | "image_bundle";
  kindLabel: "视频" | "图片包";
  originalFileName: string;
  status: "待分析" | "分析中" | "已完成" | "失败";
  progress: number;
  intervalLabel: string;
  assetCountLabel: string;
  createdAtLabel: string;
  fileSizeLabel: string;
  videoUrl: string | null;
  errorMessage: string | null;
}

export function toMediaTaskDetail(record: MediaTaskRecord, getContentUrl: (path: string) => string): MediaTaskDetail {
  const task = toMediaTaskViewModel(record);
  return {
    id: task.id,
    assetKind: task.assetKind,
    kindLabel: task.kindLabel,
    originalFileName: task.originalFileName,
    status: task.status,
    progress: task.progress,
    intervalLabel: task.assetKind === "video" ? `每 ${task.frameIntervalSec} 秒抽 1 帧` : "图片包解压",
    assetCountLabel: `${task.assetCount} ${task.assetKind === "video" ? "帧" : "张"}`,
    createdAtLabel: formatDateTime(record.createdAt),
    fileSizeLabel: formatFileSize(record.fileSize),
    videoUrl: task.assetKind === "video" ? getContentUrl(`/media-assets/${task.id}/content`) : null,
    errorMessage: task.errorMessage,
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
