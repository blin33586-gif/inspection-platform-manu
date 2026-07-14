import assert from "node:assert/strict";
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
