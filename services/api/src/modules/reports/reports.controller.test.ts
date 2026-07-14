import assert from "node:assert/strict";
import test from "node:test";
import { Module } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { DatabaseService } from "../../database/database.service.js";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { currentProjectId } from "../auth/project-context.js";
import { ProjectContextInterceptor } from "../auth/project-context.interceptor.js";
import { ReportCreateService } from "./report-create.service.js";
import { ReportPdfService } from "./report-pdf.service.js";
import { ReportUploadService } from "./report-upload.service.js";
import { ReportsController } from "./reports.controller.js";

test("returns a non-empty PDF as a UTF-8 attachment", async () => {
  let responseType = "";
  const headers = new Map<string, string>();
  let sentBody: Buffer | undefined;
  const response = {
    type(value: string) { responseType = value; return this; },
    setHeader(name: string, value: string) { headers.set(name, value); return this; },
    send(value: Buffer) { sentBody = value; return this; },
  };
  const pdfService = {
    create: async (id: string) => {
      assert.equal(id, "rp-1");
      return { buffer: Uint8Array.from([37, 80, 68, 70, 45]), fileName: "曲阳路巡检报告.pdf" };
    },
  };
  const controller = new ReportsController({} as never, {} as never, {} as never, {} as never, pdfService as never);

  await controller.pdf("rp-1", response as never);

  assert.equal(responseType, "application/pdf");
  assert.match(headers.get("Content-Disposition") ?? "", /^attachment; filename="report\.pdf"; filename\*=UTF-8''/);
  assert.ok(sentBody);
  assert.ok(sentBody.length > 0);
  assert.equal(sentBody.subarray(0, 4).toString("ascii"), "%PDF");
});

const memberIdentity = {
  id: "member-1",
  sub: "member-1",
  username: "member",
  name: "巡检成员",
  role: "member" as const,
  tokenVersion: 1,
  projectIds: ["quyang"],
};

@Module({
  controllers: [ReportsController],
  providers: [
    { provide: DatabaseService, useValue: {} },
    { provide: InspectionReadRepository, useValue: {} },
    { provide: ReportUploadService, useValue: {} },
    { provide: ReportCreateService, useValue: {} },
    {
      provide: ReportPdfService,
      useValue: {
        create: async (id: string) => {
          assert.equal(id, "rp-http");
          assert.equal(currentProjectId(), "quyang");
          return { buffer: Uint8Array.from([37, 80, 68, 70, 45]), fileName: "曲阳路巡检报告.pdf" };
        },
      },
    },
    {
      provide: AuthService,
      useValue: { authenticateToken: async (token: string | undefined) => token === "valid-token" ? memberIdentity : null },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ProjectContextInterceptor },
  ],
})
class ReportPdfHttpTestModule {}

test("enforces authentication and project headers through the Nest PDF route", async () => {
  let app: INestApplication | undefined;
  try {
    app = await NestFactory.create(ReportPdfHttpTestModule, { logger: false });
    app.setGlobalPrefix("api/v1");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/api/v1/reports/rp-http/pdf`;

    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: "Bearer valid-token" } })).status, 400);
    assert.equal((await fetch(url, { headers: { Authorization: "Bearer valid-token", "X-Project-Id": "other" } })).status, 403);

    const response = await fetch(url, { headers: { Authorization: "Bearer valid-token", "X-Project-Id": "quyang" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/pdf");
    assert.match(response.headers.get("Content-Disposition") ?? "", /^attachment; filename="report\.pdf"; filename\*=UTF-8''/);
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString("ascii"), "%PDF");
  } finally {
    await app?.close();
  }
});
