export interface ArchiveTaskPhotoRecord {
  id: string;
  taskId: string;
  mediaAssetId: string;
  distributionStatus: string;
  archiveObjectId: string | null;
  capturedAt: string | null;
  videoTimestampMs: number | null;
  mediaAsset: {
    id: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    createdAt: string;
  };
  archiveObject: { id: string; name: string; objectType: string } | null;
  task: { id: string; name: string; taskDate: string; sourceType: string };
}

export interface ProjectArchiveMediaItem {
  id: string;
  taskId: string;
  taskPhotoId: string;
  mediaAssetId: string;
  title: string;
  linkedObjectId?: string;
  linkedObjectName: string;
  issueTitle: string;
  status: string;
  capturedAt: string;
  sourceName: string;
  thumbnailUrl: string;
  fileName: string;
}

export function isArchiveMediaResponseCurrent(
  requestedObjectId: string,
  activeObjectId: string | null | undefined,
) {
  return requestedObjectId === activeObjectId;
}

export function isArchiveMediaRequestCurrent(
  requestId: number,
  latestRequestId: number,
  requestedObjectId: string,
  activeObjectId: string | null | undefined,
) {
  return requestId === latestRequestId
    && isArchiveMediaResponseCurrent(requestedObjectId, activeObjectId);
}

const sourceLabels: Record<string, string> = {
  manual: "人工上传",
  drone: "无人机",
  camera: "摄像头",
  glasses: "智能眼镜",
};

const statusLabels: Record<string, string> = {
  pending: "待分发",
  archived: "已归档",
  ignored: "已忽略",
};

export function toProjectArchiveMediaItem(
  photo: ArchiveTaskPhotoRecord,
  thumbnailUrl: string,
): ProjectArchiveMediaItem {
  return {
    id: photo.id,
    taskId: photo.taskId,
    taskPhotoId: photo.id,
    mediaAssetId: photo.mediaAssetId,
    title: photo.mediaAsset.originalFileName,
    ...(photo.archiveObjectId ? { linkedObjectId: photo.archiveObjectId } : {}),
    linkedObjectName: photo.archiveObject?.name ?? "尚未归档",
    issueTitle: photo.task.name,
    status: statusLabels[photo.distributionStatus] ?? photo.distributionStatus,
    capturedAt: photo.capturedAt
      ? formatShanghaiDateTime(photo.capturedAt)
      : photo.videoTimestampMs !== null
        ? formatVideoTimestamp(photo.videoTimestampMs)
        : formatShanghaiDateTime(photo.mediaAsset.createdAt),
    sourceName: sourceLabels[photo.task.sourceType] ?? photo.task.sourceType,
    thumbnailUrl,
    fileName: photo.mediaAsset.originalFileName,
  };
}

function formatVideoTimestamp(value: number) {
  const seconds = Math.floor(value / 1000);
  const minutes = Math.floor(seconds / 60);
  return `视频 ${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
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
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((item) => item.type === type)?.value ?? ""
  );
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
