import { exiftool } from "exiftool-vendored";
import type { VideoTelemetrySample } from "./video-telemetry.js";
type Matched=VideoTelemetrySample&{matchOffsetMs:number};
export function buildFrameExifTags(t:Matched){
  const localCaptureTime = new Date(t.capturedAt.getTime() + 8 * 60 * 60 * 1000);
  const [date, time] = localCaptureTime.toISOString().split("T");
  return {
    DateTimeOriginal: `${date.replaceAll("-", ":")} ${time.slice(0, 8)}`,
    OffsetTimeOriginal: "+08:00",
    SubSecTimeOriginal: String(localCaptureTime.getUTCMilliseconds()).padStart(3, "0"),
    GPSLatitude:t.latitude,
    GPSLongitude:t.longitude,
    GPSAltitude:t.absoluteAltitudeMeters,
    FocalLength:t.focalLengthMillimeters,
    UserComment:`relative_alt=${t.relativeAltitudeMeters};gimbal=${t.gimbalYawDegrees},${t.gimbalPitchDegrees},${t.gimbalRollDegrees};zoom=${t.digitalZoomRatio};video_ms=${t.timestampMs}`,
  };
}
export async function writeFrameExif(path:string,t:Matched){await exiftool.write(path,buildFrameExifTags(t),["-overwrite_original"]);}
