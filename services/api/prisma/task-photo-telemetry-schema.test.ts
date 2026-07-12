import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("defines one telemetry record per task photo", async () => { const schema=await readFile(new URL("./schema.prisma",import.meta.url),"utf8"); assert.match(schema,/model TaskPhotoTelemetry\s*\{/); assert.match(schema,/taskPhotoId\s+String\s+@unique/); assert.match(schema,/gimbalPitchDegrees\s+Float\?/); });
