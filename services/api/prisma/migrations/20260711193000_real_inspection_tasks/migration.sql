-- AlterTable
ALTER TABLE "InspectionReport" ADD COLUMN "taskId" TEXT;

-- CreateTable
CREATE TABLE "InspectionTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taskDate" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "processStatus" TEXT NOT NULL,
    "sourceMediaId" TEXT,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "pendingPhotoCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskPhoto" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "distributionStatus" TEXT NOT NULL DEFAULT 'pending',
    "archiveObjectId" TEXT,
    "capturedAt" TIMESTAMP(3),
    "videoTimestampMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InspectionReport_taskId_key" ON "InspectionReport"("taskId");
CREATE UNIQUE INDEX "InspectionTask_sourceMediaId_key" ON "InspectionTask"("sourceMediaId");
CREATE INDEX "InspectionTask_taskDate_idx" ON "InspectionTask"("taskDate");
CREATE INDEX "InspectionTask_sourceType_idx" ON "InspectionTask"("sourceType");
CREATE INDEX "InspectionTask_processStatus_idx" ON "InspectionTask"("processStatus");
CREATE INDEX "InspectionTask_createdAt_idx" ON "InspectionTask"("createdAt");
CREATE UNIQUE INDEX "TaskPhoto_mediaAssetId_key" ON "TaskPhoto"("mediaAssetId");
CREATE INDEX "TaskPhoto_taskId_distributionStatus_idx" ON "TaskPhoto"("taskId", "distributionStatus");
CREATE INDEX "TaskPhoto_archiveObjectId_idx" ON "TaskPhoto"("archiveObjectId");
CREATE INDEX "TaskPhoto_capturedAt_idx" ON "TaskPhoto"("capturedAt");

-- AddForeignKey
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "InspectionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InspectionTask" ADD CONSTRAINT "InspectionTask_sourceMediaId_fkey" FOREIGN KEY ("sourceMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskPhoto" ADD CONSTRAINT "TaskPhoto_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "InspectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskPhoto" ADD CONSTRAINT "TaskPhoto_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskPhoto" ADD CONSTRAINT "TaskPhoto_archiveObjectId_fkey" FOREIGN KEY ("archiveObjectId") REFERENCES "ManagedObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing top-level videos and image archives as historical tasks.
INSERT INTO "InspectionTask" (
    "id", "name", "taskDate", "sourceType", "inputType", "processStatus",
    "sourceMediaId", "photoCount", "pendingPhotoCount", "createdAt", "updatedAt"
)
SELECT
    'task-' || media."id",
    '历史任务 · ' || media."originalFileName",
    media."createdAt",
    'manual',
    CASE WHEN media."kind" = 'video' THEN 'video' ELSE 'archive' END,
    CASE
        WHEN latest_job."status" = 'completed' THEN 'ready_for_distribution'
        WHEN latest_job."status" = 'running' THEN 'processing'
        WHEN latest_job."status" IN ('failed', 'cancelled') THEN 'failed'
        ELSE 'queued'
    END,
    media."id",
    COALESCE(photo_summary."photoCount", 0),
    COALESCE(photo_summary."photoCount", 0),
    media."createdAt",
    media."createdAt"
FROM "MediaAsset" media
LEFT JOIN LATERAL (
    SELECT job."status"
    FROM "MediaProcessingJob" job
    WHERE job."mediaId" = media."id"
    ORDER BY job."createdAt" DESC
    LIMIT 1
) latest_job ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS "photoCount"
    FROM "MediaAsset" child
    WHERE child."parentMediaId" = media."id"
      AND child."kind" IN ('frame', 'image')
) photo_summary ON TRUE
WHERE media."parentMediaId" IS NULL
  AND media."kind" IN ('video', 'image_bundle');

-- Backfill extracted frames and archive images as pending task photos.
INSERT INTO "TaskPhoto" (
    "id", "taskId", "mediaAssetId", "distributionStatus", "archiveObjectId",
    "capturedAt", "videoTimestampMs", "createdAt", "updatedAt"
)
SELECT
    'photo-' || child."id",
    'task-' || child."parentMediaId",
    child."id",
    'pending',
    NULL,
    NULL,
    child."videoTimestampMs",
    child."createdAt",
    child."createdAt"
FROM "MediaAsset" child
WHERE child."parentMediaId" IS NOT NULL
  AND child."kind" IN ('frame', 'image')
  AND EXISTS (
    SELECT 1 FROM "InspectionTask" task WHERE task."id" = 'task-' || child."parentMediaId"
  );
