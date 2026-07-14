import assert from "node:assert/strict";
import test from "node:test";
import { resolvePdfBrowserExecutable } from "./pdf-browser-runtime.js";

test("prefers the configured PDF browser", () => {
  assert.equal(resolvePdfBrowserExecutable({ PDF_BROWSER_EXECUTABLE: "/opt/chromium" }, "linux"), "/opt/chromium");
});

test("uses the standard macOS Chrome path", () => {
  assert.equal(resolvePdfBrowserExecutable({}, "darwin"), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
});

test("uses the container Chromium path on Linux", () => {
  assert.equal(resolvePdfBrowserExecutable({}, "linux"), "/usr/bin/chromium");
});
