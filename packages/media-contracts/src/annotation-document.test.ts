import assert from "node:assert/strict";
import test from "node:test";
import { validateAnnotationDocument } from "./annotation-document.js";

test("accepts relative rectangle, arrow, and text elements", () => {
  assert.deepEqual(validateAnnotationDocument({
    canvasVersion: 1,
    elements: [
      {
        id: "rect-1",
        type: "rectangle",
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.4,
        color: "#ef4444",
        text: "堆料区域",
      },
      {
        id: "arrow-1",
        type: "arrow",
        x: 0.1,
        y: 0.2,
        endX: 0.7,
        endY: 0.8,
        color: "#f59e0b",
        text: "车辆方向",
      },
      {
        id: "text-1",
        type: "text",
        x: 0.5,
        y: 0.5,
        text: "疑似施工",
        color: "#2563eb",
        width: 0.2,
      },
    ],
  }), {
    canvasVersion: 1,
    elements: [
      {
        id: "rect-1",
        type: "rectangle",
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.4,
        color: "#ef4444",
        text: "堆料区域",
      },
      {
        id: "arrow-1",
        type: "arrow",
        x: 0.1,
        y: 0.2,
        endX: 0.7,
        endY: 0.8,
        color: "#f59e0b",
        text: "车辆方向",
      },
      {
        id: "text-1",
        type: "text",
        x: 0.5,
        y: 0.5,
        text: "疑似施工",
        color: "#2563eb",
        width: 0.2,
      },
    ],
  });
});

test("rejects an element outside the normalized canvas", () => {
  assert.throws(() => validateAnnotationDocument({
    canvasVersion: 1,
    elements: [{ id: "bad", type: "text", x: 1.1, y: 0.5, text: "越界", color: "#2563eb" }],
  }), /坐标/);
});

test("rejects unknown annotation element types", () => {
  assert.throws(() => validateAnnotationDocument({
    canvasVersion: 1,
    elements: [{ id: "bad", type: "circle", x: 0.5, y: 0.5, color: "#2563eb" }] as never,
  }), /类型/);
});
