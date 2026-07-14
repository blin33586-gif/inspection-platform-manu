CREATE TABLE "IssueRectificationRecord" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IssueRectificationRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "IssueAttachment" ADD COLUMN "rectificationRecordId" TEXT;

CREATE INDEX "IssueRectificationRecord_issueId_createdAt_idx"
    ON "IssueRectificationRecord"("issueId", "createdAt");

CREATE INDEX "IssueAttachment_rectificationRecordId_idx"
    ON "IssueAttachment"("rectificationRecordId");

ALTER TABLE "IssueRectificationRecord"
    ADD CONSTRAINT "IssueRectificationRecord_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IssueAttachment"
    ADD CONSTRAINT "IssueAttachment_rectificationRecordId_fkey"
    FOREIGN KEY ("rectificationRecordId") REFERENCES "IssueRectificationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
