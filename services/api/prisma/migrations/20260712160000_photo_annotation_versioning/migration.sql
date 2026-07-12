CREATE TABLE "PhotoAnnotationDocument" (
    "id" TEXT NOT NULL,
    "taskPhotoId" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "annotationJson" TEXT NOT NULL,
    "issueDescription" TEXT,
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoAnnotationDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhotoAnnotationVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "annotationJson" TEXT NOT NULL,
    "issueDescription" TEXT,
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoAnnotationVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhotoAnnotationDocument_taskPhotoId_key" ON "PhotoAnnotationDocument"("taskPhotoId");
CREATE UNIQUE INDEX "PhotoAnnotationVersion_documentId_version_key" ON "PhotoAnnotationVersion"("documentId", "version");
CREATE INDEX "PhotoAnnotationDocument_updatedAt_idx" ON "PhotoAnnotationDocument"("updatedAt");
CREATE INDEX "PhotoAnnotationVersion_documentId_createdAt_idx" ON "PhotoAnnotationVersion"("documentId", "createdAt");

ALTER TABLE "PhotoAnnotationDocument" ADD CONSTRAINT "PhotoAnnotationDocument_taskPhotoId_fkey"
  FOREIGN KEY ("taskPhotoId") REFERENCES "TaskPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhotoAnnotationVersion" ADD CONSTRAINT "PhotoAnnotationVersion_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "PhotoAnnotationDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
