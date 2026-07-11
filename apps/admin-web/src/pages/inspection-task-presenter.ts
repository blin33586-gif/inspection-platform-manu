export interface InspectionTaskRecord {
  id: string;
  name: string;
  taskDate: string;
  sourceType: string;
  inputType: string;
  processStatus: string;
  sourceMediaId: string | null;
  photoCount: number;
  pendingPhotoCount: number;
  createdAt: string;
  sourceMedia: {
    id: string;
    originalFileName: string;
    kind: string;
    jobs: Array<{ id: string; progress: number; status: string; errorMessage: string | null }>;
  } | null;
  photos: Array<{ mediaAsset: { id: string } }>;
  report: { id: string; processStatus: string } | null;
}

const sourceLabels: Record<string, { label: string; tone: string }> = {
  manual: { label: "人工上传", tone: "orange" },
  drone: { label: "无人机", tone: "blue" },
  camera: { label: "摄像头", tone: "green" },
  glasses: { label: "智能眼镜", tone: "purple" },
};

const inputLabels: Record<string, string> = {
  video: "视频",
  archive: "ZIP 图片包",
  images: "图片",
};

const statusLabels: Record<string, { label: string; tone: string }> = {
  queued: { label: "排队中", tone: "waiting" },
  running: { label: "处理中", tone: "processing" },
  ready_for_distribution: { label: "待分发", tone: "review" },
  completed: { label: "已完成", tone: "done" },
  failed: { label: "失败", tone: "failed" },
};

export function toInspectionTaskViewModel(record: InspectionTaskRecord) {
  const source = sourceLabels[record.sourceType] ?? { label: record.sourceType, tone: "blue" };
  const status = statusLabels[record.processStatus] ?? { label: record.processStatus, tone: "waiting" };
  const job = record.sourceMedia?.jobs[0] ?? null;

  return {
    id: record.id,
    name: record.name,
    sourceLabel: source.label,
    sourceTone: source.tone,
    inputLabel: inputLabels[record.inputType] ?? record.inputType,
    statusLabel: status.label,
    statusTone: status.tone,
    photoCount: record.photoCount,
    pendingPhotoCount: record.pendingPhotoCount,
    progress: job?.progress ?? (record.processStatus === "ready_for_distribution" || record.processStatus === "completed" ? 100 : 0),
    originalFileName: record.sourceMedia?.originalFileName ?? `${record.photoCount} 张直接上传图片`,
    posterAssetId: record.photos[0]?.mediaAsset.id ?? null,
    sourceMediaId: record.sourceMediaId,
    jobId: job?.id ?? null,
    errorMessage: job?.errorMessage ?? null,
    taskDateLabel: record.taskDate.slice(0, 10),
    createdAtLabel: formatShanghaiDateTime(record.createdAt),
    reportId: record.report?.id ?? null,
  };
}

function formatShanghaiDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
