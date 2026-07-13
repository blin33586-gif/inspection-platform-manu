import assert from "node:assert/strict";
import test from "node:test";
import { resolveRuntimeConfig } from "./runtime-config.js";

test("production requires explicit administrator credentials and signing secret", () => {
  assert.throws(
    () => resolveRuntimeConfig({ NODE_ENV: "production" }),
    /ADMIN_USERNAME, ADMIN_PASSWORD and AUTH_SECRET/,
  );
});

test("production may start without legacy member credentials when no bootstrap is needed", () => {
  const config = resolveRuntimeConfig({
    NODE_ENV: "production",
    ADMIN_USERNAME: "operator",
    ADMIN_PASSWORD: "operator-password-2026",
    AUTH_SECRET: "production-signing-secret",
  });

  assert.equal(config.memberUsername, undefined);
  assert.equal(config.memberPassword, undefined);
});

test("production rejects partial or weak legacy member credentials", () => {
  const base = {
    NODE_ENV: "production",
    ADMIN_USERNAME: "operator",
    ADMIN_PASSWORD: "operator-password-2026",
    AUTH_SECRET: "production-signing-secret",
  };

  assert.throws(() => resolveRuntimeConfig({ ...base, MEMBER_USERNAME: "member" }), /MEMBER_USERNAME and MEMBER_PASSWORD/);
  assert.throws(() => resolveRuntimeConfig({ ...base, MEMBER_PASSWORD: "strong-member-password-2026" }), /MEMBER_USERNAME and MEMBER_PASSWORD/);
  assert.throws(
    () => resolveRuntimeConfig({ ...base, MEMBER_USERNAME: "member", MEMBER_PASSWORD: "password" }),
    /strong password/,
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
    MEMBER_USERNAME: "reader",
    MEMBER_PASSWORD: "reader-password",
    AUTH_SECRET: "secret",
  });

  assert.equal(config.adminUsername, "operator");
  assert.equal(config.adminPassword, "password");
  assert.equal(config.memberUsername, "reader");
  assert.equal(config.memberPassword, "reader-password");
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
