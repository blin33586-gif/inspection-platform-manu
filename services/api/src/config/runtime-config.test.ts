import assert from "node:assert/strict";
import test from "node:test";
import { resolveRuntimeConfig } from "./runtime-config.js";

test("production requires explicit credentials and signing secret", () => {
  assert.throws(
    () => resolveRuntimeConfig({ NODE_ENV: "production" }),
    /ADMIN_USERNAME, ADMIN_PASSWORD and AUTH_SECRET/,
  );
});

test("development listens on all interfaces by default", () => {
  const config = resolveRuntimeConfig({});

  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 3010);
  assert.equal(config.isProduction, false);
});

test("runtime configuration exposes configured credentials", () => {
  const config = resolveRuntimeConfig({
    ADMIN_USERNAME: "operator",
    ADMIN_PASSWORD: "password",
    AUTH_SECRET: "secret",
  });

  assert.equal(config.adminUsername, "operator");
  assert.equal(config.adminPassword, "password");
  assert.equal(config.authSecret, "secret");
});

for (const port of ["", "0", "-1", "65536", "1.5", "not-a-port"]) {
  test(`runtime configuration rejects invalid API_PORT value ${JSON.stringify(port)}`, () => {
    assert.throws(
      () => resolveRuntimeConfig({ API_PORT: port }),
      /API_PORT must be a valid TCP port/,
    );
  });
}
