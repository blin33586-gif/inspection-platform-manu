import { exiftool } from "exiftool-vendored";
import type { VideoTelemetrySample } from "./video-telemetry.js";
type Matched=VideoTelemetrySample&{matchOffsetMs:number};
export function buildFrameExifTags(t:Matched){return {DateTimeOriginal:t.capturedAt.toISOString().replace("T"," ").replace("Z",""),GPSLatitude:t.latitude,GPSLongitude:t.longitude,GPSAltitude:t.absoluteAltitudeMeters,FocalLength:t.focalLengthMillimeters,UserComment:`relative_alt=${t.relativeAltitudeMeters};gimbal=${t.gimbalYawDegrees},${t.gimbalPitchDegrees},${t.gimbalRollDegrees};zoom=${t.digitalZoomRatio};video_ms=${t.timestampMs}`};}
export async function writeFrameExif(path:string,t:Matched){await exiftool.write(path,buildFrameExifTags(t),["-overwrite_original"]);}
