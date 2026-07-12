ALTER TABLE "Issue"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "locationName" TEXT,
  ADD COLUMN "sourceTaskPhotoId" TEXT,
  ADD COLUMN "sourceAnnotationVersion" INTEGER,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "shareTokenHash" TEXT,
  ADD COLUMN "shareEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cardStoragePath" TEXT,
  ADD COLUMN "cardMimeType" TEXT,
  ADD COLUMN "cardFileSize" INTEGER,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "publishIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "Issue_shareTokenHash_key" ON "Issue"("shareTokenHash");
CREATE UNIQUE INDEX "Issue_publishIdempotencyKey_key" ON "Issue"("publishIdempotencyKey");
CREATE INDEX "Issue_sourceTaskPhotoId_idx" ON "Issue"("sourceTaskPhotoId");
CREATE INDEX "Issue_shareEnabled_idx" ON "Issue"("shareEnabled");

ALTER TABLE "Issue" ADD CONSTRAINT "Issue_sourceTaskPhotoId_fkey"
  FOREIGN KEY ("sourceTaskPhotoId") REFERENCES "TaskPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
