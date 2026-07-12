CREATE INDEX "task_photo_pending_feed_idx"
ON "TaskPhoto"("distributionStatus", "capturedAt", "videoTimestampMs", "createdAt", "id");

CREATE INDEX "task_photo_task_order_idx"
ON "TaskPhoto"("taskId", "videoTimestampMs", "createdAt", "id");
