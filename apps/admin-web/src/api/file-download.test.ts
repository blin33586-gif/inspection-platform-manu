import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthenticatedHeaders,
  getDownloadFileName,
  saveResponseAsDownload,
} from "./file-download.js";

test("reuses bearer authentication and project selection headers", () => {
  assert.deepEqual(buildAuthenticatedHeaders("token-1", "quyang"), {
    Authorization: "Bearer token-1",
    "X-Project-Id": "quyang",
  });
  assert.deepEqual(buildAuthenticatedHeaders(null, null), {});
});

test("prefers the UTF-8 Content-Disposition filename", () => {
  assert.equal(
    getDownloadFileName("attachment; filename=report.pdf; filename*=UTF-8''%E6%9B%B2%E9%98%B3%E8%B7%AF%E6%8A%A5%E5%91%8A.pdf", "fallback.pdf"),
    "曲阳路报告.pdf",
  );
  assert.equal(getDownloadFileName('attachment; filename="server-report.pdf"', "fallback.pdf"), "server-report.pdf");
  assert.equal(getDownloadFileName(null, "fallback.pdf"), "fallback.pdf");
});

test("cleans up the temporary anchor and object URL after download", async () => {
  const events: string[] = [];
  const anchor = {
    href: "",
    download: "",
    hidden: false,
    click: () => events.push("click"),
    remove: () => events.push("remove"),
  };
  const response = new Response("pdf", {
    headers: { "Content-Disposition": "attachment; filename*=UTF-8''server.pdf" },
  });

  await saveResponseAsDownload(response, "fallback.pdf", {
    createObjectUrl: () => { events.push("create"); return "blob:pdf"; },
    revokeObjectUrl: (url) => events.push(`revoke:${url}`),
    createAnchor: () => anchor,
    appendAnchor: () => events.push("append"),
  });

  assert.equal(anchor.href, "blob:pdf");
  assert.equal(anchor.download, "server.pdf");
  assert.deepEqual(events, ["create", "append", "click", "remove", "revoke:blob:pdf"]);
});

test("revokes the object URL and propagates an append failure", async () => {
  const events: string[] = [];
  const expected = new Error("无法挂载下载链接");
  const anchor = { href: "", download: "", hidden: false, click: () => {}, remove: () => events.push("remove") };

  await assert.rejects(saveResponseAsDownload(new Response("pdf"), "fallback.pdf", {
    createObjectUrl: () => "blob:failed",
    revokeObjectUrl: (url) => events.push(`revoke:${url}`),
    createAnchor: () => anchor,
    appendAnchor: () => { throw expected; },
  }), (error) => error === expected);
  assert.deepEqual(events, ["remove", "revoke:blob:failed"]);
});
