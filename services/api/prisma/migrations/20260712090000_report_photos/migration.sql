CREATE TABLE "ReportPhoto" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "taskPhotoId" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportPhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportPhoto_reportId_taskPhotoId_key"
ON "ReportPhoto"("reportId", "taskPhotoId");

CREATE INDEX "ReportPhoto_reportId_sortIndex_idx"
ON "ReportPhoto"("reportId", "sortIndex");

CREATE INDEX "ReportPhoto_taskPhotoId_idx"
ON "ReportPhoto"("taskPhotoId");

ALTER TABLE "ReportPhoto"
ADD CONSTRAINT "ReportPhoto_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "InspectionReport"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportPhoto"
ADD CONSTRAINT "ReportPhoto_taskPhotoId_fkey"
FOREIGN KEY ("taskPhotoId") REFERENCES "TaskPhoto"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
