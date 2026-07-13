CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "customerType" TEXT NOT NULL,
    "archiveDimensions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Project" ("id", "name", "shortName", "customerType", "archiveDimensions", "updatedAt") VALUES
('quyang', '曲阳街道城管巡检项目', '曲阳街道', '街道城管', '[{"key":"community","label":"小区档案"},{"key":"road","label":"道路街面"},{"key":"point","label":"重点点位"}]'::jsonb, CURRENT_TIMESTAMP),
('jinshan', '金山化工园区项目', '金山化工园区', '化工园区', '[{"key":"community","label":"企业档案"},{"key":"road","label":"道路档案"},{"key":"point","label":"河道档案"}]'::jsonb, CURRENT_TIMESTAMP);

ALTER TABLE "DashboardMetric" ADD COLUMN "projectId" TEXT NOT NULL DEFAULT 'quyang';
ALTER TABLE "IssueCategoryStat" ADD COLUMN "projectId" TEXT NOT NULL DEFAULT 'quyang';
ALTER TABLE "ManagedObject" ADD COLUMN "projectId" TEXT NOT NULL DEFAULT 'quyang';
ALTER TABLE "Issue" ADD COLUMN "projectId" TEXT NOT NULL DEFAULT 'quyang';
ALTER TABLE "InspectionReport" ADD COLUMN "projectId" TEXT NOT NULL DEFAULT 'quyang';
ALTER TABLE "MapAsset" ADD COLUMN "projectId" TEXT NOT NULL DEFAULT 'quyang';
ALTER TABLE "MediaProcessingJob" ADD COLUMN "projectId" TEXT NOT NULL DEFAULT 'quyang';
ALTER TABLE "MediaAsset" ADD COLUMN "projectId" TEXT NOT NULL DEFAULT 'quyang';
ALTER TABLE "InspectionTask" ADD COLUMN "projectId" TEXT NOT NULL DEFAULT 'quyang';
ALTER TABLE "AuditLog" ADD COLUMN "projectId" TEXT NOT NULL DEFAULT 'quyang';

ALTER TABLE "DashboardMetric" DROP CONSTRAINT "DashboardMetric_pkey";
ALTER TABLE "DashboardMetric" ADD CONSTRAINT "DashboardMetric_pkey" PRIMARY KEY ("projectId", "key");

CREATE INDEX "DashboardMetric_projectId_idx" ON "DashboardMetric"("projectId");
CREATE INDEX "IssueCategoryStat_projectId_sort_idx" ON "IssueCategoryStat"("projectId", "sort");
CREATE INDEX "ManagedObject_projectId_objectType_idx" ON "ManagedObject"("projectId", "objectType");
CREATE INDEX "Issue_projectId_status_idx" ON "Issue"("projectId", "status");
CREATE INDEX "InspectionReport_projectId_reportDate_idx" ON "InspectionReport"("projectId", "reportDate");
CREATE INDEX "MapAsset_projectId_isActive_idx" ON "MapAsset"("projectId", "isActive");
CREATE INDEX "MediaProcessingJob_projectId_status_idx" ON "MediaProcessingJob"("projectId", "status");
CREATE INDEX "MediaAsset_projectId_createdAt_idx" ON "MediaAsset"("projectId", "createdAt");
CREATE INDEX "InspectionTask_projectId_taskDate_idx" ON "InspectionTask"("projectId", "taskDate");
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");

ALTER TABLE "DashboardMetric" ADD CONSTRAINT "DashboardMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IssueCategoryStat" ADD CONSTRAINT "IssueCategoryStat_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManagedObject" ADD CONSTRAINT "ManagedObject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MapAsset" ADD CONSTRAINT "MapAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaProcessingJob" ADD CONSTRAINT "MediaProcessingJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionTask" ADD CONSTRAINT "InspectionTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "DashboardMetric" ("projectId", "key", "label", "value", "remark", "updatedAt") VALUES
('jinshan', 'inspectionsThisMonth', '本月巡检', 0, '金山项目独立统计', CURRENT_TIMESTAMP),
('jinshan', 'issuesThisMonth', '本月发现问题', 0, '金山项目独立统计', CURRENT_TIMESTAMP),
('jinshan', 'pendingIssues', '待处理', 0, '金山项目独立统计', CURRENT_TIMESTAMP);

INSERT INTO "IssueCategoryStat" ("projectId", "id", "category", "value", "sort") VALUES
('jinshan', 'js-stat-enterprise', '企业安全', 0, 1),
('jinshan', 'js-stat-road', '园区道路', 0, 2),
('jinshan', 'js-stat-river', '河道环境', 0, 3);

INSERT INTO "ManagedObject" ("projectId", "id", "name", "objectType", "objectSubtype", "parentName", "status", "issueCount", "reportCount", "createdAt", "updatedAt") VALUES
('jinshan', 'js-company-001', '上海化工区示例企业', 'community', '企业', '金山化工园区', '稳定', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('jinshan', 'js-road-001', '园区示例道路', 'road', '园区道路', '金山化工园区', '稳定', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('jinshan', 'js-river-001', '园区示例河道', 'point', '河道', '金山化工园区', '稳定', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
