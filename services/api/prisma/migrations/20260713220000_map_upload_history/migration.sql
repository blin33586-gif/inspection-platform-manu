-- AlterTable
ALTER TABLE "MapAsset"
ADD COLUMN "uploadedByAccountId" TEXT,
ADD COLUMN "errorMessage" TEXT,
ADD COLUMN "activatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MapAsset_uploadedByAccountId_idx" ON "MapAsset"("uploadedByAccountId");

-- AddForeignKey
ALTER TABLE "MapAsset" ADD CONSTRAINT "MapAsset_uploadedByAccountId_fkey"
FOREIGN KEY ("uploadedByAccountId") REFERENCES "UserAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
