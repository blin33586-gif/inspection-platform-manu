import type { ExtractedFrame } from "./ffmpeg-frame-extractor.js";
import { extractVideoTelemetry } from "./ffmpeg-video-telemetry.js";
import { writeFrameExif } from "./frame-exif-writer.js";
import { matchFrameTelemetry } from "./video-telemetry.js";

export interface EnrichedFrame extends ExtractedFrame { telemetry: ReturnType<typeof matchFrameTelemetry> }
export async function enrichExtractedFrames(videoPath:string,frames:ExtractedFrame[],deps={extractVideoTelemetry,writeFrameExif}){
  const track=await deps.extractVideoTelemetry(videoPath); let exifWritten=0,exifFailed=0;
  const enriched:EnrichedFrame[]=[];
  for(const frame of frames){const telemetry=matchFrameTelemetry(frame.timestampMs,track); if(telemetry){try{await deps.writeFrameExif(frame.storagePath,telemetry);exifWritten++;}catch{exifFailed++;}} enriched.push({...frame,telemetry});}
  return {frames:enriched,stats:{telemetrySource:track.source,telemetrySampleCount:track.samples.length,telemetryMatchedFrameCount:enriched.filter(f=>f.telemetry).length,telemetryUnmatchedFrameCount:enriched.filter(f=>!f.telemetry).length,telemetryWarningCount:track.warnings.length,exifWrittenFrameCount:exifWritten,exifFailedFrameCount:exifFailed}};
}
