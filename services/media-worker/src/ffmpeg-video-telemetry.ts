import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { parseDjiTelemetrySrt, type VideoTelemetryTrack } from "./video-telemetry.js";

const execFileAsync = promisify(execFile);
interface ProbeResult { streams?: Array<{ index: number; codec_name?: string; tags?: { handler_name?: string } }> }
export function findTelemetryStreamIndex(probe: ProbeResult) { return probe.streams?.find((stream) => stream.codec_name === "mov_text" || /subtitle/i.test(stream.tags?.handler_name ?? ""))?.index ?? null; }
export function buildTelemetryExtractCommand(videoPath:string,outputPath:string,index:number) { return { command:"ffmpeg" as const,args:["-v","error","-i",videoPath,"-map",`0:${index}`,"-y",outputPath] }; }
export async function extractVideoTelemetry(videoPath:string):Promise<VideoTelemetryTrack> {
  const { stdout } = await execFileAsync("ffprobe",["-v","error","-show_streams","-print_format","json",videoPath],{maxBuffer:16*1024*1024});
  const index=findTelemetryStreamIndex(JSON.parse(stdout)); if(index===null)return {source:"none",samples:[],warnings:[]};
  const dir=await mkdtemp(join(tmpdir(),"xjb-telemetry-")); const path=join(dir,"telemetry.srt");
  try { const command=buildTelemetryExtractCommand(videoPath,path,index); await execFileAsync(command.command,command.args,{maxBuffer:32*1024*1024}); return parseDjiTelemetrySrt(await readFile(path,"utf8")); }
  finally { await rm(dir,{recursive:true,force:true}); }
}
