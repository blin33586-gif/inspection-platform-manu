import assert from "node:assert/strict";
import test from "node:test";
import { Controller, Get, Module } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AuthModule } from "../auth/auth.module.js";
import { HealthModule } from "./health.module.js";

@Controller("test-protected")
class ProtectedRouteController {
  @Get()
  getProtected() {
    return { status: "protected" };
  }
}

@Module({
  imports: [AuthModule, HealthModule],
  controllers: [ProtectedRouteController],
})
class HealthHttpTestModule {}

test("GET /api/v1/health is public and protected routes require authentication", async () => {
  let app: INestApplication | undefined;

  try {
    app = await NestFactory.create(HealthHttpTestModule, { logger: false });
    app.setGlobalPrefix("api/v1");
    await app.listen(0, "127.0.0.1");

    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== "string");

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const healthResponse = await fetch(`${baseUrl}/api/v1/health`);

    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), {
      code: 0,
      message: "ok",
      data: { status: "ok" },
    });

    const protectedResponse = await fetch(`${baseUrl}/api/v1/test-protected`);
    assert.equal(protectedResponse.status, 401);
  } finally {
    await app?.close();
  }
});
