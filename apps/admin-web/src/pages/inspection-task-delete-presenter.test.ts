import assert from "node:assert/strict";
import test from "node:test";
import { describeTaskPurgeImpact } from "./inspection-task-delete-presenter.js";

test("describes the permanent task purge impact for the confirmation dialog", () => {
  assert.equal(
    describeTaskPurgeImpact({
      name: "7月巡检任务",
      photoCount: 86,
      pendingPhotoCount: 75,
      reportId: "rp-1",
    }),
    "将永久删除「7月巡检任务」及其 86 张任务照片、75 张待分发照片和 1 份综合报告。由这些照片推送的问题、分享卡和问题附件也会一并删除；对象档案本身不会删除。",
  );
});
