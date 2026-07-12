export interface PhotoLocation {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
}

export interface PhotoTelemetryLocation {
  latitude: number | null;
  longitude: number | null;
  absoluteAltitudeMeters: number | null;
}

export function resolvePhotoCoordinateText(
  annotation: PhotoLocation,
  telemetry?: PhotoTelemetryLocation | null,
) {
  const latitude = annotation.latitude ?? telemetry?.latitude ?? null;
  const longitude = annotation.longitude ?? telemetry?.longitude ?? null;
  const altitude = annotation.altitude ?? telemetry?.absoluteAltitudeMeters ?? null;
  if (latitude === null || longitude === null) return "";
  const base = `${latitude}, ${longitude}`;
  return altitude === null ? base : `${base}, ${altitude}`;
}

export function resolvePhotoCapturedAt(uploadedAt?: string, telemetryCapturedAt?: string | null) {
  if (!telemetryCapturedAt) return uploadedAt ?? "-";
  const capturedAt = new Date(telemetryCapturedAt);
  if (Number.isNaN(capturedAt.getTime())) return uploadedAt ?? "-";
  return capturedAt.toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
}
