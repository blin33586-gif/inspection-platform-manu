import type { ExtractedFrame } from "./ffmpeg-frame-extractor.js";
import { stat } from "node:fs/promises";
import { extractVideoTelemetry } from "./ffmpeg-video-telemetry.js";
import { writeFrameExif } from "./frame-exif-writer.js";
import { matchFrameTelemetry } from "./video-telemetry.js";

export interface EnrichedFrame extends ExtractedFrame { telemetry: ReturnType<typeof matchFrameTelemetry> }
interface FrameTelemetryDependencies {
  extractVideoTelemetry: typeof extractVideoTelemetry;
  writeFrameExif: typeof writeFrameExif;
  readFrameFileSize: (path: string) => Promise<number>;
}

const defaultDependencies: FrameTelemetryDependencies = {
  extractVideoTelemetry,
  writeFrameExif,
  readFrameFileSize: async (path) => (await stat(path)).size,
};

export async function enrichExtractedFrames(videoPath:string,frames:ExtractedFrame[],deps:Partial<FrameTelemetryDependencies>={}){
  const handlers = { ...defaultDependencies, ...deps };
  const track=await handlers.extractVideoTelemetry(videoPath); let exifWritten=0,exifFailed=0;
  const enriched:EnrichedFrame[]=[];
  for(const frame of frames){
    const telemetry=matchFrameTelemetry(frame.timestampMs,track);
    let fileSize=frame.fileSize;
    if(telemetry){
      try{
        await handlers.writeFrameExif(frame.storagePath,telemetry);
        fileSize=await handlers.readFrameFileSize(frame.storagePath);
        exifWritten++;
      }catch{exifFailed++;}
    }
    enriched.push({...frame,fileSize,telemetry});
  }
  return {frames:enriched,stats:{telemetrySource:track.source,telemetrySampleCount:track.samples.length,telemetryMatchedFrameCount:enriched.filter(f=>f.telemetry).length,telemetryUnmatchedFrameCount:enriched.filter(f=>!f.telemetry).length,telemetryWarningCount:track.warnings.length,exifWrittenFrameCount:exifWritten,exifFailedFrameCount:exifFailed}};
}
