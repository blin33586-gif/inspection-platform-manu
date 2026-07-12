import type { AnnotationDocumentPayload, AnnotationElement } from "@xunjianbao/media-contracts";

export type ReportAnnotationShape = "rect" | "arrow" | "text";
export type ReportAnnotationTone = "danger" | "warning" | "info";

export interface ReportCanvasAnnotation {
  id: number;
  photoId: number;
  title: string;
  description: string;
  tone: ReportAnnotationTone;
  shape: ReportAnnotationShape;
  x: number;
  y: number;
  width: number;
  height: number;
  lineStartX?: number;
  lineStartY?: number;
  lineEndX?: number;
  lineEndY?: number;
}

export interface PhotoCoordinates {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
}

const toneColor: Record<ReportAnnotationTone, string> = {
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#2563eb",
};

export function toAnnotationPayload(items: ReportCanvasAnnotation[]): AnnotationDocumentPayload {
  return {
    canvasVersion: 1,
    elements: items.map(toElement),
  };
}

export function fromAnnotationPayload(payload: AnnotationDocumentPayload, photoId: number): ReportCanvasAnnotation[] {
  return payload.elements.map((element, index) => fromElement(element, photoId, index));
}

export function parsePhotoCoordinates(value: string): PhotoCoordinates {
  if (!value.trim()) return { latitude: null, longitude: null, altitude: null };
  const values = value.split(/[,，\s]+/).filter(Boolean).map(Number);
  if (values.length < 2 || values.length > 3 || values.some((item) => !Number.isFinite(item))) {
    throw new Error("坐标格式应为 纬度, 经度[, 高度]");
  }
  const [latitude, longitude, altitude = null] = values;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error("经纬度超出有效范围");
  }
  return { latitude, longitude, altitude };
}

function toElement(item: ReportCanvasAnnotation): AnnotationElement {
  const base = {
    id: `annotation-${item.id}`,
    color: toneColor[item.tone],
    text: item.title,
    description: item.description,
  };
  if (item.shape === "rect") {
    return {
      ...base,
      type: "rectangle",
      x: item.x / 100,
      y: item.y / 100,
      width: item.width / 100,
      height: item.height / 100,
    };
  }
  if (item.shape === "arrow") {
    const startX = item.x + item.width * (item.lineStartX ?? 0) / 100;
    const startY = item.y + item.height * (item.lineStartY ?? 50) / 100;
    const endX = item.x + item.width * (item.lineEndX ?? 100) / 100;
    const endY = item.y + item.height * (item.lineEndY ?? 50) / 100;
    return {
      ...base,
      type: "arrow",
      x: startX / 100,
      y: startY / 100,
      endX: endX / 100,
      endY: endY / 100,
    };
  }
  return {
    ...base,
    type: "text",
    x: item.x / 100,
    y: item.y / 100,
    width: item.width / 100,
  };
}

function fromElement(element: AnnotationElement, photoId: number, index: number): ReportCanvasAnnotation {
  const id = stableNumericId(element.id, index + 1);
  const tone = colorTone(element.color);
  if (element.type === "rectangle") {
    return {
      id,
      photoId,
      title: element.text ?? "矩形问题框",
      description: element.description ?? "",
      tone,
      shape: "rect",
      x: element.x * 100,
      y: element.y * 100,
      width: element.width * 100,
      height: element.height * 100,
    };
  }
  if (element.type === "arrow") {
    const x = Math.min(element.x, element.endX) * 100;
    const y = Math.min(element.y, element.endY) * 100;
    const width = Math.max(Math.abs(element.endX - element.x) * 100, 4);
    const height = Math.max(Math.abs(element.endY - element.y) * 100, 4);
    const leftToRight = element.endX >= element.x;
    const topToBottom = element.endY >= element.y;
    return {
      id,
      photoId,
      title: element.text ?? "箭头指示",
      description: element.description ?? "",
      tone,
      shape: "arrow",
      x,
      y,
      width,
      height,
      lineStartX: leftToRight ? 0 : 100,
      lineStartY: topToBottom ? 0 : 100,
      lineEndX: leftToRight ? 100 : 0,
      lineEndY: topToBottom ? 100 : 0,
    };
  }
  return {
    id,
    photoId,
    title: element.text,
    description: element.description ?? "",
    tone,
    shape: "text",
    x: element.x * 100,
    y: element.y * 100,
    width: (element.width ?? 0.12) * 100,
    height: 6,
  };
}

function stableNumericId(value: string, fallback: number) {
  const suffix = value.match(/(\d+)$/)?.[1];
  const id = suffix ? Number.parseInt(suffix, 10) : fallback;
  return Number.isSafeInteger(id) && id > 0 ? id : fallback;
}

function colorTone(color: string): ReportAnnotationTone {
  if (color === toneColor.warning) return "warning";
  if (color === toneColor.info) return "info";
  return "danger";
}
