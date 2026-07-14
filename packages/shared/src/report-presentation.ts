export interface ReportPhotoPageInput {
  index: number;
  relatedObjectName: string;
  fileName: string;
  issueTitle?: string | null;
  issueCategory?: string | null;
  issueDescription?: string | null;
  videoTimestampMs?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ReportPhotoPageModel {
  indexLabel: string;
  title: string;
  fileName: string;
  videoTime: string | null;
  coordinates: string | null;
  description: string;
  footer: string;
}

export const REPORT_DOCUMENT_COPY = {
  kicker: "巡检宝 · 综合巡检报告",
  reportDate: "巡检日期",
  relatedObject: "巡检区域",
  issueCount: "问题数量",
  photoCount: "照片数量",
  photoFile: "照片文件",
  videoTime: "视频时间点",
  coordinates: "经纬度",
} as const;

export function buildReportPhotoPageModel(input: ReportPhotoPageInput): ReportPhotoPageModel {
  return {
    indexLabel: `问题 ${String(input.index + 1).padStart(2, "0")}`,
    title: input.issueTitle || input.issueCategory || "巡检现场照片",
    fileName: input.fileName,
    videoTime: formatReportVideoTime(input.videoTimestampMs),
    coordinates: formatReportCoordinates(input.latitude, input.longitude),
    description: input.issueDescription || "该照片已纳入本次巡检综合报告。",
    footer: `巡检宝 · ${input.relatedObjectName} · 第 ${input.index + 1} 页`,
  };
}

function formatReportVideoTime(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const seconds = Math.floor(value / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatReportCoordinates(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}
