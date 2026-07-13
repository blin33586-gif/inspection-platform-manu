ALTER TABLE "MediaProcessingJob"
ADD COLUMN "leaseOwner" TEXT,
ADD COLUMN "attemptId" TEXT,
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "heartbeatAt" TIMESTAMP(3);

CREATE TABLE "MapWorkerLease" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MapWorkerLease_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MediaProcessingJob_status_leaseExpiresAt_idx"
ON "MediaProcessingJob"("status", "leaseExpiresAt");

WITH ranked_active_maps AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "projectId"
      ORDER BY "activatedAt" DESC NULLS LAST, "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS active_rank
  FROM "MapAsset"
  WHERE "isActive" = true
)
UPDATE "MapAsset" AS asset
SET "isActive" = false
FROM ranked_active_maps AS ranked
WHERE asset."id" = ranked."id"
  AND ranked.active_rank > 1;

CREATE UNIQUE INDEX "MapAsset_one_active_per_project"
ON "MapAsset"("projectId")
WHERE "isActive" = true;
