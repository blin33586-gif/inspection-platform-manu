import assert from "node:assert/strict";
import test from "node:test";
import type { ManagedObjectArchiveIssue } from "@xunjianbao/shared";
import {
  filterArchiveIssues,
  formatArchiveDateTime,
  formatLatestInspectionTime,
  issueSeverityTone,
} from "./project-archive-overview-presenter.js";

const issues: ManagedObjectArchiveIssue[] = [
  {
    id: "open",
    title: "广告牌破损",
    category: "广告牌",
    severity: "high",
    state: "open",
    stateLabel: "未闭环",
    foundAt: "2026-07-12T08:00:00.000Z",
    updatedAt: "2026-07-12T09:00:00.000Z",
    sourceLabel: "无人机",
  },
  {
    id: "completed",
    title: "车辆乱停放",
    category: "街面秩序",
    severity: "normal",
    state: "completed",
    stateLabel: "已完成",
    foundAt: "2026-07-11T08:00:00.000Z",
    updatedAt: "2026-07-13T10:00:00.000Z",
    sourceLabel: "人工上传",
  },
];

test("filters archive issues by the two user-facing closure states", () => {
  assert.deepEqual(filterArchiveIssues(issues, "all").map((issue) => issue.id), ["open", "completed"]);
  assert.deepEqual(filterArchiveIssues(issues, "open").map((issue) => issue.id), ["open"]);
  assert.deepEqual(filterArchiveIssues(issues, "completed").map((issue) => issue.id), ["completed"]);
});

test("formats real archive timestamps and severity tones", () => {
  assert.equal(formatArchiveDateTime("2026-07-12T08:00:00.000Z"), "07-12 16:00");
  assert.equal(formatLatestInspectionTime(null), "暂无");
  assert.equal(issueSeverityTone("high"), "danger");
  assert.equal(issueSeverityTone("medium"), "warning");
  assert.equal(issueSeverityTone("normal"), "info");
});
