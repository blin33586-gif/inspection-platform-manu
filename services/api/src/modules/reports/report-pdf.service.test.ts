import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runAsMember } from "../../test-support/auth-context.js";
import { ReportPdfService } from "./report-pdf.service.js";

test("creates a project-scoped PDF with embedded report photos", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "report-pdf-"));
  const photoPath = join(tempDirectory, "DJI_0003.jpg");
  await writeFile(photoPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  let findUniqueWhere: unknown;
  let capturedHtml = "";
  let pdfOptions: unknown;
  let browserClosed = false;
  const database = {
    inspectionReport: {
      findUnique: async (input: { where: unknown }) => {
        findUniqueWhere = input.where;
        return {
          id: "rp-1",
          title: "历史任务 / DJI_0003",
          reportDate: new Date("2026-07-08T00:00:00.000Z"),
          relatedObjectName: "曲阳路街道重点区域",
          issueCount: 1,
          contentSummary: "巡检完成",
          photos: [{
            taskPhoto: {
              id: "photo-1",
              mediaAsset: {
                originalFileName: "DJI_0003.jpg",
                storagePath: photoPath,
                mimeType: "image/jpeg",
                previewStoragePath: null,
                previewMimeType: null,
              },
              annotationDocument: { issueDescription: "现场描述" },
              sourceIssues: [{ title: "飞线问题", category: "飞线", description: "问题描述", cardStoragePath: null, cardMimeType: null }],
            },
          }],
        };
      },
    },
  };
  const browserLauncher = {
    launch: async () => ({
      newPage: async () => ({
        setContent: async (html: string) => { capturedHtml = html; },
        pdf: async (options: unknown) => {
          pdfOptions = options;
          return Uint8Array.from([37, 80, 68, 70]);
        },
      }),
      close: async () => { browserClosed = true; },
    }),
  };

  try {
    const service = new ReportPdfService(database as never, browserLauncher as never);
    const result = await runAsMember(() => service.create("rp-1"));

    assert.deepEqual(findUniqueWhere, { id: "rp-1", projectId: "quyang" });
    assert.deepEqual([...result.buffer], [37, 80, 68, 70]);
    assert.equal(result.fileName, "历史任务_DJI_0003.pdf");
    assert.match(capturedHtml, /data:image\/jpeg;base64/);
    assert.deepEqual(pdfOptions, { format: "A4", printBackground: true, preferCSSPageSize: true });
    assert.equal(browserClosed, true);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
