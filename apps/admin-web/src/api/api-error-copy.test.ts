import assert from "node:assert/strict";
import test from "node:test";
import { getApiErrorCopy } from "./api-error-copy.js";

test("maps unauthorized errors to an explicit login instruction", () => {
  assert.equal(
    getApiErrorCopy({ status: 401 } as Error & { status: number }),
    "登录状态已失效，请重新登录后再试",
  );
});

test("maps missing resources to an explicit not-found instruction", () => {
  assert.equal(
    getApiErrorCopy({ status: 404 } as Error & { status: number }),
    "该条资料不存在，可能已被删除或没有访问权限",
  );
});
