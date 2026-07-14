import assert from "node:assert/strict";
import test from "node:test";
import { getReportDownloadName } from "./report-export.js";

test("creates a safe PDF filename", () => {
  assert.equal(getReportDownloadName("历史任务 / DJI_0003"), "历史任务_DJI_0003.pdf");
});
