export interface MediaJobRecord {
  id: string;
  status: string;
  progress: number;
  inputJson: string;
  outputJson?: string | null;
  errorMessage?: string | null;
}

export interface VideoMediaRecord {
  id: string;
  originalFileName: string;
  createdAt: string;
  jobs: MediaJobRecord[];
}

export interface MediaChildSummary {
  id: string;
  kind: "frame" | "image";
  originalFileName: string;
}

export interface MediaTaskRecord extends VideoMediaRecord {
  kind: "video" | "image_bundle";
  mimeType: string;
  fileSize: number;
  frames: MediaChildSummary[];
}

export interface MediaTaskViewModel {
  id: string;
  jobId: string | null;
  assetKind: "video" | "image_bundle";
  kindLabel: "视频" | "图片包";
  originalFileName: string;
  frameIntervalSec: number;
  assetCount: number;
  posterAssetId: string | null;
  status: "待分析" | "分析中" | "已完成" | "失败";
  progress: number;
  errorMessage: string | null;
}

export interface PersistedVideoTask {
  id: string;
  jobId: string | null;
  videoName: string;
  frameIntervalSec: number;
  frameCount: number;
  status: "待分析" | "分析中" | "已完成" | "失败";
  progress: number;
  errorMessage: string | null;
}

export function toPersistedVideoTask(media: VideoMediaRecord): PersistedVideoTask {
  const job = media.jobs[0];
  const input = parseJson(job?.inputJson);
  const output = parseJson(job?.outputJson);
  return {
    id: media.id,
    jobId: job?.id ?? null,
    videoName: media.originalFileName,
    frameIntervalSec: numberValue(input.intervalSeconds, 3),
    frameCount: numberValue(output.frameCount, 0),
    status: jobStatus(job?.status),
    progress: numberValue(job?.progress, 0),
    errorMessage: job?.errorMessage ?? null,
  };
}

export function toMediaTaskViewModel(media: MediaTaskRecord): MediaTaskViewModel {
  const job = media.jobs[0];
  const input = parseJson(job?.inputJson);
  const output = parseJson(job?.outputJson);
  const isVideo = media.kind === "video";
  return {
    id: media.id,
    jobId: job?.id ?? null,
    assetKind: media.kind,
    kindLabel: isVideo ? "视频" : "图片包",
    originalFileName: media.originalFileName,
    frameIntervalSec: numberValue(input.intervalSeconds, 3),
    assetCount: numberValue(isVideo ? output.frameCount : output.imageCount, 0),
    posterAssetId: media.frames[0]?.id ?? null,
    status: jobStatus(job?.status),
    progress: numberValue(job?.progress, 0),
    errorMessage: job?.errorMessage ?? null,
  };
}

function jobStatus(status: string | undefined): PersistedVideoTask["status"] {
  if (status === "running") return "分析中";
  if (status === "completed") return "已完成";
  if (status === "failed" || status === "cancelled") return "失败";
  return "待分析";
}

function parseJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const result = JSON.parse(value) as unknown;
    return result && typeof result === "object" ? result as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
