import assert from "node:assert/strict";
import test from "node:test";
import { HealthController } from "./health.controller.js";

test("health endpoint returns the standard ok response", () => {
  const controller = new HealthController();

  assert.deepEqual(controller.getHealth(), {
    code: 0,
    message: "ok",
    data: { status: "ok" },
  });
});
