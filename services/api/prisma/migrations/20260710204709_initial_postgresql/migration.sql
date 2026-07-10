-- CreateTable
CREATE TABLE "DashboardMetric" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "remark" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardMetric_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IssueCategoryStat" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IssueCategoryStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagedObject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectSubtype" TEXT,
    "parentName" TEXT,
    "status" TEXT NOT NULL,
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "foundAt" TIMESTAMP(3) NOT NULL,
    "objectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueAttachment" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "attachmentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionReport" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "reportType" TEXT NOT NULL,
    "relatedObjectId" TEXT,
    "relatedObjectName" TEXT NOT NULL,
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "contentSummary" TEXT,
    "fileName" TEXT,
    "originalFileName" TEXT,
    "storagePath" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "processStatus" TEXT NOT NULL DEFAULT 'uploaded',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mapType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "fileName" TEXT,
    "originalFileName" TEXT,
    "storagePath" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "tilePath" TEXT,
    "tileMetadata" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "processStatus" TEXT NOT NULL,
    "hotAreaCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapHotArea" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "mapAssetId" TEXT NOT NULL,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "polygon" TEXT,
    "color" TEXT,

    CONSTRAINT "MapHotArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagedObject_objectType_idx" ON "ManagedObject"("objectType");

-- CreateIndex
CREATE INDEX "ManagedObject_status_idx" ON "ManagedObject"("status");

-- CreateIndex
CREATE INDEX "Issue_objectId_idx" ON "Issue"("objectId");

-- CreateIndex
CREATE INDEX "Issue_status_idx" ON "Issue"("status");

-- CreateIndex
CREATE INDEX "Issue_foundAt_idx" ON "Issue"("foundAt");

-- CreateIndex
CREATE INDEX "IssueAttachment_issueId_idx" ON "IssueAttachment"("issueId");

-- CreateIndex
CREATE INDEX "IssueAttachment_attachmentType_idx" ON "IssueAttachment"("attachmentType");

-- CreateIndex
CREATE INDEX "IssueAttachment_createdAt_idx" ON "IssueAttachment"("createdAt");

-- CreateIndex
CREATE INDEX "InspectionReport_relatedObjectId_idx" ON "InspectionReport"("relatedObjectId");

-- CreateIndex
CREATE INDEX "InspectionReport_reportType_idx" ON "InspectionReport"("reportType");

-- CreateIndex
CREATE INDEX "InspectionReport_reportDate_idx" ON "InspectionReport"("reportDate");

-- CreateIndex
CREATE INDEX "InspectionReport_processStatus_idx" ON "InspectionReport"("processStatus");

-- CreateIndex
CREATE INDEX "MapAsset_mapType_idx" ON "MapAsset"("mapType");

-- CreateIndex
CREATE INDEX "MapAsset_processStatus_idx" ON "MapAsset"("processStatus");

-- CreateIndex
CREATE INDEX "MapAsset_isActive_idx" ON "MapAsset"("isActive");

-- CreateIndex
CREATE INDEX "MapHotArea_mapAssetId_idx" ON "MapHotArea"("mapAssetId");

-- CreateIndex
CREATE INDEX "MapHotArea_objectId_idx" ON "MapHotArea"("objectId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_idx" ON "AuditLog"("targetType");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "ManagedObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueAttachment" ADD CONSTRAINT "IssueAttachment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_relatedObjectId_fkey" FOREIGN KEY ("relatedObjectId") REFERENCES "ManagedObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapHotArea" ADD CONSTRAINT "MapHotArea_mapAssetId_fkey" FOREIGN KEY ("mapAssetId") REFERENCES "MapAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapHotArea" ADD CONSTRAINT "MapHotArea_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "ManagedObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
