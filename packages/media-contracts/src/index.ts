export * from "./image-format.js";
export * from "./annotation-document.js";

export type MediaKind = "image" | "video" | "frame" | "map_source" | "map_tile";

export type MediaJobType = "frame_extract" | "archive_extract" | "image_prepare" | "tiff_tile";

export type MediaJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AnnotationItem {
  id: string;
  type: "rect" | "arrow" | "text";
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: [number, number, number, number];
  text?: string;
  color: string;
  lineWidth: number;
  severity?: "low" | "medium" | "high";
  zIndex: number;
}

export interface AnnotationDocument {
  version: 1;
  mediaId: string;
  imageWidth: number;
  imageHeight: number;
  annotations: AnnotationItem[];
}

export function createEmptyAnnotationDocument(mediaId: string, imageWidth: number, imageHeight: number): AnnotationDocument {
  return {
    version: 1,
    mediaId,
    imageWidth,
    imageHeight,
    annotations: [],
  };
}
