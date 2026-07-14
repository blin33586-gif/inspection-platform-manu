import assert from "node:assert/strict";
import test from "node:test";
import { canExportReport, createSingleFlightRunner, getReportDownloadName } from "./report-export.js";

test("creates a safe PDF filename", () => {
  assert.equal(getReportDownloadName("历史任务 / DJI_0003"), "历史任务_DJI_0003.pdf");
});

test("only enables export after the report loaded and while idle", () => {
  assert.equal(canExportReport(false, false), false);
  assert.equal(canExportReport(true, true), false);
  assert.equal(canExportReport(true, false), true);
});

test("prevents duplicate exports and propagates the original error", async () => {
  const runner = createSingleFlightRunner();
  let release!: () => void;
  let calls = 0;
  const first = runner.run(async () => {
    calls += 1;
    await new Promise<void>((resolve) => { release = resolve; });
  });
  const duplicate = runner.run(async () => { calls += 1; });

  assert.equal(await duplicate, false);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, true);

  const expected = new Error("后端导出失败");
  await assert.rejects(runner.run(async () => { throw expected; }), (error) => error === expected);
  assert.equal(await runner.run(async () => {}), true);
});
