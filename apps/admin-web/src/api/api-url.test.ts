import assert from "node:assert/strict";
import test from "node:test";
import { buildApiUrl } from "./api-url.js";

test("adds the login token only for protected API URLs", () => {
  assert.equal(
    buildApiUrl("http://127.0.0.1:3010/api/v1", "/media-assets/photo/content", "http://127.0.0.1:5183", "admin-token", "jinshan"),
    "http://127.0.0.1:3010/api/v1/media-assets/photo/content?token=admin-token&projectId=jinshan",
  );
  assert.equal(
    buildApiUrl("http://127.0.0.1:3010/api/v1", "/public/issues/share/card.png", "http://127.0.0.1:5183"),
    "http://127.0.0.1:3010/api/v1/public/issues/share/card.png",
  );
});
