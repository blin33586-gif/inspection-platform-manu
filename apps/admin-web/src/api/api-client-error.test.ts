import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError } from "./api-client-error.js";

test("keeps HTTP status and readable API message", () => {
  const error = new ApiClientError(422, "文件格式不支持");
  assert.equal(error.status, 422);
  assert.equal(error.message, "文件格式不支持");
});
