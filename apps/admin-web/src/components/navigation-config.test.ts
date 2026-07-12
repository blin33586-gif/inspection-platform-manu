import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_NAV_ITEMS, PRIMARY_NAV_ITEMS } from "./navigation-config.js";

test("keeps business modules in the primary navigation", () => {
  assert.deepEqual(PRIMARY_NAV_ITEMS, [
    { to: "/media-library", label: "任务库" },
    { to: "/reports", label: "报告库" },
    { to: "/issues", label: "待跟进线索" },
  ]);
});

test("moves map and operation logs into the account menu", () => {
  assert.deepEqual(ACCOUNT_NAV_ITEMS, [
    { to: "/map-assets", label: "地图" },
    { to: "/audit-logs", label: "操作日志" },
  ]);
});
