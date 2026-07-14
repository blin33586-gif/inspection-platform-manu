import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canCloseIssue, getIssueDetailStatusLabel, isIssueReadOnly } from "./issue-detail-presenter.js";

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
  assert.match(page, /该问题已闭环，整改记录已锁定/);
  assert.match(styles, /\.issue-detail-overview\s*\{/);
  assert.match(styles, /\.rectification-feed\s*\{/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.issue-detail-meta\s*\{\s*grid-template-columns:\s*repeat\(2,/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*\.issue-detail-meta\s*\{\s*grid-template-columns:\s*1fr/);
});
