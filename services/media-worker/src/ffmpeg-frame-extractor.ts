import { execFile } from "node:child_process";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FrameExtractCommand {
  command: "ffmpeg";
  args: string[];
}

export interface ExtractedFrame {
  fileName: string;
  storagePath: string;
  fileSize: number;
  timestampMs: number;
}

export function buildFrameExtractCommand(sourcePath: string, outputPattern: string, intervalSeconds: number): FrameExtractCommand {
  return {
    command: "ffmpeg",
    args: ["-i", sourcePath, "-vf", `fps=1/${intervalSeconds}`, "-q:v", "2", outputPattern],
  };
}

export async function extractVideoFrames(sourcePath: string, outputDirectory: string, intervalSeconds: number) {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const outputPattern = join(outputDirectory, "frame-%010d.jpg");
  const command = buildFrameExtractCommand(sourcePath, outputPattern, intervalSeconds);
  await execFileAsync(command.command, command.args, { maxBuffer: 32 * 1024 * 1024 });

  const frameNames = (await readdir(outputDirectory))
    .filter((name) => /^frame-\d{10}\.jpg$/.test(name))
    .sort();

  return Promise.all(frameNames.map(async (fileName, index): Promise<ExtractedFrame> => {
    const storagePath = join(outputDirectory, fileName);
    const fileStat = await stat(storagePath);
    return { fileName, storagePath, fileSize: fileStat.size, timestampMs: index * intervalSeconds * 1000 };
  }));
}
