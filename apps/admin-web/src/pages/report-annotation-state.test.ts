import assert from "node:assert/strict";
import test from "node:test";
import {
  fromAnnotationPayload,
  parsePhotoCoordinates,
  toAnnotationPayload,
  type ReportCanvasAnnotation,
} from "./report-annotation-state.js";

test("converts report canvas annotations into normalized persisted payload", () => {
  const items: ReportCanvasAnnotation[] = [
    {
      id: 1,
      photoId: 7,
      title: "堆料区域",
      description: "楼顶堆料需要复核",
      tone: "danger",
      shape: "rect",
      x: 25,
      y: 50,
      width: 20,
      height: 10,
    },
    {
      id: 2,
      photoId: 7,
      title: "车辆方向",
      description: "车辆驶向北侧",
      tone: "warning",
      shape: "arrow",
      x: 10,
      y: 20,
      width: 50,
      height: 20,
      lineStartX: 0,
      lineStartY: 0,
      lineEndX: 100,
      lineEndY: 100,
    },
  ];

  assert.deepEqual(toAnnotationPayload(items), {
    canvasVersion: 1,
    elements: [
      {
        id: "annotation-1",
        type: "rectangle",
        x: 0.25,
        y: 0.5,
        width: 0.2,
        height: 0.1,
        color: "#ef4444",
        text: "堆料区域",
        description: "楼顶堆料需要复核",
      },
      {
        id: "annotation-2",
        type: "arrow",
        x: 0.1,
        y: 0.2,
        endX: 0.6,
        endY: 0.4,
        color: "#f59e0b",
        text: "车辆方向",
        description: "车辆驶向北侧",
      },
    ],
  });
});

test("restores a persisted arrow and its annotation description", () => {
  const restored = fromAnnotationPayload({
    canvasVersion: 1,
    elements: [{
      id: "annotation-4",
      type: "arrow",
      x: 0.1,
      y: 0.2,
      endX: 0.6,
      endY: 0.4,
      color: "#f59e0b",
      text: "车辆方向",
      description: "车辆驶向北侧",
    }],
  }, 7);

  assert.deepEqual(restored, [{
    id: 4,
    photoId: 7,
    title: "车辆方向",
    description: "车辆驶向北侧",
    tone: "warning",
    shape: "arrow",
    x: 10,
    y: 20,
    width: 50,
    height: 20,
    lineStartX: 0,
    lineStartY: 0,
    lineEndX: 100,
    lineEndY: 100,
  }]);
});

test("parses latitude, longitude, and optional altitude from the report coordinate field", () => {
  assert.deepEqual(parsePhotoCoordinates("31.288210, 121.491320, 86.5"), {
    latitude: 31.28821,
    longitude: 121.49132,
    altitude: 86.5,
  });
});
