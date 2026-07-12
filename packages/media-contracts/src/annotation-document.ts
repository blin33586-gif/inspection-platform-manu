export type AnnotationSource = "manual" | "ai";

export interface AnnotationRectangleElement {
  id: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
  description?: string;
}

export interface AnnotationArrowElement {
  id: string;
  type: "arrow";
  x: number;
  y: number;
  endX: number;
  endY: number;
  color: string;
  text?: string;
  description?: string;
}

export interface AnnotationTextElement {
  id: string;
  type: "text";
  x: number;
  y: number;
  color: string;
  text: string;
  width?: number;
  description?: string;
}

export type AnnotationElement = AnnotationRectangleElement | AnnotationArrowElement | AnnotationTextElement;

export interface AnnotationDocumentPayload {
  canvasVersion: 1;
  elements: AnnotationElement[];
}

export function validateAnnotationDocument(value: unknown): AnnotationDocumentPayload {
  if (!isRecord(value) || value.canvasVersion !== 1 || !Array.isArray(value.elements)) {
    throw new Error("标注数据格式无效");
  }

  const ids = new Set<string>();
  const elements = value.elements.map((element) => validateElement(element, ids));
  return { canvasVersion: 1, elements };
}

function validateElement(value: unknown, ids: Set<string>): AnnotationElement {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) {
    throw new Error("标注元素缺少标识");
  }
  if (ids.has(value.id)) throw new Error("标注元素标识重复");
  ids.add(value.id);

  if (typeof value.color !== "string" || !value.color.trim()) throw new Error("标注颜色无效");
  assertCoordinate(value.x);
  assertCoordinate(value.y);

  if (value.type === "rectangle") {
    assertCoordinate(value.width);
    assertCoordinate(value.height);
    if (value.x + value.width > 1 || value.y + value.height > 1) throw new Error("标注坐标超出画布范围");
    return {
      id: value.id,
      type: "rectangle",
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height,
      color: value.color,
      ...(optionalText(value.text)),
      ...(optionalDescription(value.description)),
    };
  }

  if (value.type === "arrow") {
    assertCoordinate(value.endX);
    assertCoordinate(value.endY);
    return {
      id: value.id,
      type: "arrow",
      x: value.x,
      y: value.y,
      endX: value.endX,
      endY: value.endY,
      color: value.color,
      ...(optionalText(value.text)),
      ...(optionalDescription(value.description)),
    };
  }

  if (value.type === "text") {
    if (typeof value.text !== "string" || !value.text.trim()) throw new Error("文字标注不能为空");
    if (value.width !== undefined) assertCoordinate(value.width);
    return {
      id: value.id,
      type: "text",
      x: value.x,
      y: value.y,
      color: value.color,
      text: value.text,
      ...(value.width === undefined ? {} : { width: value.width }),
      ...(optionalDescription(value.description)),
    };
  }

  throw new Error("标注元素类型无效");
}

function assertCoordinate(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("标注坐标必须位于 0 到 1 之间");
  }
}

function optionalText(value: unknown) {
  if (value === undefined) return {};
  if (typeof value !== "string") throw new Error("标注文字无效");
  return { text: value };
}

function optionalDescription(value: unknown) {
  if (value === undefined) return {};
  if (typeof value !== "string") throw new Error("标注说明无效");
  return { description: value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
