import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canCloseIssue,
  formatShanghaiDateTime,
  fromShanghaiDateTimeInput,
  getIssueDetailStatusLabel,
  issueSeverityLabel,
  isIssueReadOnly,
  toLocalDateTimeInput,
} from "./issue-detail-presenter.js";

test("maps verified to the user-facing closed state", () => {
  assert.equal(getIssueDetailStatusLabel("verified"), "已闭环");
});

test("requires a record before closure", () => {
  assert.equal(canCloseIssue("pending", 0), false);
  assert.equal(canCloseIssue("processing", 1), true);
  assert.equal(canCloseIssue("verified", 1), false);
});

test("makes closed issues read-only", () => {
  assert.equal(isIssueReadOnly("verified"), true);
  assert.equal(isIssueReadOnly("pending"), false);
});

test("maps issue severities to user-facing labels", () => {
  assert.equal(issueSeverityLabel("high"), "严重");
  assert.equal(issueSeverityLabel("medium"), "重要");
  assert.equal(issueSeverityLabel("normal"), "轻微");
});

test("converts an ISO timestamp to a local datetime input value", () => {
  assert.equal(toLocalDateTimeInput("2026-07-08T01:35:00.000Z"), "2026-07-08T09:35");
});

test("converts a Shanghai datetime input value to a full ISO timestamp", () => {
  assert.equal(fromShanghaiDateTimeInput("2026-07-08T09:35"), "2026-07-08T01:35:00.000Z");
});

test("formats issue timestamps in Shanghai time", () => {
  assert.equal(formatShanghaiDateTime("2026-07-08T01:35:00.000Z"), "2026/7/8 09:35:00");
});

test("builds the compact rectification workspace contract", async () => {
  const page = await readFile(new URL("./IssueDetailPage.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../styles/global.css", import.meta.url), "utf8");

  assert.match(page, /const fallbackRectifications: IssueRectificationRecordSummary\[\] = \[\];/);
  assert.doesNotMatch(page, /useApiResource<IssueRectificationRecordSummary\[\]>\([^\n]+, \[\]\)/);
  assert.doesNotMatch(page, /eyebrow="ISSUE DETAIL"/);
  assert.match(page, /IssueRectificationRecordSummary/);
  assert.match(page, /\/issues\/\$\{id\}\/rectifications/);
  assert.match(page, /<Upload[\s\S]*multiple[\s\S]*maxCount=\{6\}/);
  assert.match(page, /formData\.append\("files",/);
  assert.match(page, /<Popconfirm/);
  assert.match(page, /确认闭环/);
  assert.match(page, /<Image\.PreviewGroup>/);
  assert.match(page, /src=\{getApiUrl\(photo\.thumbnailUrl\)\}/);
  assert.match(page, /preview=\{\{ src: getApiUrl\(photo\.imageUrl\) \}\}/);
  assert.match(page, /loading="lazy"/);
  assert.match(page, /该问题已闭环，整改记录已锁定/);
  assert.match(styles, /\.issue-detail-overview\s*\{/);
  assert.match(styles, /\.rectification-feed\s*\{/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.issue-detail-meta\s*\{\s*grid-template-columns:\s*repeat\(2,/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*\.issue-detail-meta\s*\{\s*grid-template-columns:\s*1fr/);
});

test("builds the unified issue metadata editor contract", async () => {
  const page = await readFile(new URL("./IssueDetailPage.tsx", import.meta.url), "utf8");

  assert.match(page, /编辑信息/);
  assert.match(page, /保存修改/);
  assert.match(page, /取消/);
  assert.match(page, /useApiResource<ManagedObjectSummary\[\]>\("\/managed-objects"/);
  assert.match(page, /patchJsonApi<[^>]+>\(`\/issues\/\$\{id\}`/);
  assert.match(page, /severityOptions/);
  assert.match(page, /<Input type="datetime-local"/);
  assert.match(page, /foundAt: fromShanghaiDateTimeInput\(values\.foundAt\)/);
  assert.match(page, /formatShanghaiDateTime\(issue\.foundAt\)/);
  assert.match(page, /if \(!issueResource\.hasLoaded \|\| issueResource\.loading\) return;/);
  assert.match(page, /disabled=\{!issueResource\.hasLoaded \|\| issueResource\.loading\}/);
  assert.doesNotMatch(page, /resourceError\s*=[\s\S]{0,240}managedObjectsResource\.error/);
  assert.match(page, /managedObjectsResource\.error[\s\S]{0,240}关联对象加载失败/);
  assert.match(page, /disabled=\{Boolean\(managedObjectsResource\.error\)\}/);
});

test("uses synchronized issue metadata in the issue library", async () => {
  const page = await readFile(new URL("./IssuesPage.tsx", import.meta.url), "utf8");

  assert.match(page, /issue\.cardImageUrl/);
  assert.match(page, /formatShanghaiDateTime\(issue\.foundAt\)/);
});
