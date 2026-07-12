DROP INDEX "task_photo_pending_feed_idx";

CREATE INDEX "task_photo_pending_feed_idx"
ON "TaskPhoto"(
  "distributionStatus" ASC,
  "capturedAt" DESC,
  "videoTimestampMs" ASC,
  "createdAt" DESC,
  "id" ASC
);
