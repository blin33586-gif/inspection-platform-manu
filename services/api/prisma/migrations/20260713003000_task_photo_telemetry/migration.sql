ALTER TABLE "TaskPhoto"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "absoluteAltitudeMeters" DOUBLE PRECISION,
  ADD COLUMN "relativeAltitudeMeters" DOUBLE PRECISION;

CREATE TABLE "TaskPhotoTelemetry" (
  "id" TEXT NOT NULL,
  "taskPhotoId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceTimestampMs" INTEGER NOT NULL,
  "matchOffsetMs" INTEGER NOT NULL,
  "capturedAt" TIMESTAMP(3),
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "relativeAltitudeMeters" DOUBLE PRECISION,
  "absoluteAltitudeMeters" DOUBLE PRECISION,
  "gimbalYawDegrees" DOUBLE PRECISION,
  "gimbalPitchDegrees" DOUBLE PRECISION,
  "gimbalRollDegrees" DOUBLE PRECISION,
  "focalLengthMillimeters" DOUBLE PRECISION,
  "digitalZoomRatio" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskPhotoTelemetry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskPhotoTelemetry_taskPhotoId_key" ON "TaskPhotoTelemetry"("taskPhotoId");
CREATE INDEX "TaskPhotoTelemetry_capturedAt_idx" ON "TaskPhotoTelemetry"("capturedAt");
CREATE INDEX "TaskPhotoTelemetry_latitude_longitude_idx" ON "TaskPhotoTelemetry"("latitude", "longitude");
ALTER TABLE "TaskPhotoTelemetry" ADD CONSTRAINT "TaskPhotoTelemetry_taskPhotoId_fkey" FOREIGN KEY ("taskPhotoId") REFERENCES "TaskPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
