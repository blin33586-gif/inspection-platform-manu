import assert from "node:assert/strict";
import test from "node:test";
import { ReportsController } from "./reports.controller.js";

test("returns a non-empty PDF as a UTF-8 attachment", async () => {
  let responseType = "";
  const headers = new Map<string, string>();
  let sentBody: Buffer | undefined;
  const response = {
    type(value: string) { responseType = value; return this; },
    setHeader(name: string, value: string) { headers.set(name, value); return this; },
    send(value: Buffer) { sentBody = value; return this; },
  };
  const pdfService = {
    create: async (id: string) => {
      assert.equal(id, "rp-1");
      return { buffer: Uint8Array.from([37, 80, 68, 70, 45]), fileName: "曲阳路巡检报告.pdf" };
    },
  };
  const controller = new ReportsController({} as never, {} as never, {} as never, {} as never, pdfService as never);

  await controller.pdf("rp-1", response as never);

  assert.equal(responseType, "application/pdf");
  assert.match(headers.get("Content-Disposition") ?? "", /^attachment; filename="report\.pdf"; filename\*=UTF-8''/);
  assert.ok(sentBody);
  assert.ok(sentBody.length > 0);
  assert.equal(sentBody.subarray(0, 4).toString("ascii"), "%PDF");
});
