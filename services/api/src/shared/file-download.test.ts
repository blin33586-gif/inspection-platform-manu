import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sendInlineStoredFile } from "./file-download.js";

test("inline files opt out of MIME sniffing", async () => {
  const root = await mkdtemp(join(tmpdir(), "xunjianbao-inline-file-"));
  const path = join(root, "photo.jpg");
  await writeFile(path, "file");
  const headers: Record<string, string> = {};
  const response = {
    type: (value: string) => { headers["Content-Type"] = value; },
    setHeader: (name: string, value: string) => { headers[name] = value; },
    sendFile: (filePath: string) => filePath,
  };

  await sendInlineStoredFile(response as never, {
    storagePath: path,
    originalFileName: "photo.jpg",
    fileName: "photo.jpg",
    mimeType: "image/jpeg",
  });

  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Content-Type"], "image/jpeg");
  assert.equal(headers["Content-Disposition"], "inline");
});
