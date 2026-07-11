import { BadRequestException } from "@nestjs/common";
import { extname } from "node:path";

export type TaskSourceType = "manual" | "drone" | "camera" | "glasses";
export type TaskInputType = "video" | "archive" | "images";

export interface TaskUploadFile {
  filename: string;
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

export interface InspectionTaskInputBody {
  name?: string;
  taskDate?: string;
  sourceType?: string;
  inputType?: string;
  intervalSeconds?: string | number;
}

export interface NormalizedTaskInput {
  name: string;
  taskDate: Date;
  sourceType: TaskSourceType;
  inputType: TaskInputType;
  intervalSeconds: number | null;
  files: TaskUploadFile[];
}

const taskSources = new Set<TaskSourceType>(["manual", "drone", "camera", "glasses"]);
const inputTypes = new Set<TaskInputType>(["video", "archive", "images"]);
const videoExtensions = new Set([".mp4", ".mov"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png"]);

export function validateTaskInput(
  body: InspectionTaskInputBody,
  files: TaskUploadFile[] | undefined,
): NormalizedTaskInput {
  const name = body.name?.trim();
  if (!name) throw new BadRequestException("请输入任务名称");

  const taskDate = parseTaskDate(body.taskDate);
  if (!taskSources.has(body.sourceType as TaskSourceType)) {
    throw new BadRequestException("任务来源必须为人工上传、无人机、摄像头或智能眼镜");
  }
  if (!inputTypes.has(body.inputType as TaskInputType)) {
    throw new BadRequestException("请选择任务输入类型");
  }

  const normalizedFiles = files ?? [];
  const inputType = body.inputType as TaskInputType;
  let intervalSeconds: number | null = null;

  if (inputType === "video") {
    if (normalizedFiles.length !== 1 || !videoExtensions.has(extensionOf(normalizedFiles[0]))) {
      throw new BadRequestException("视频任务必须上传一个视频文件，仅支持 MP4 或 MOV");
    }
    intervalSeconds = Number(body.intervalSeconds ?? 3);
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 5) {
      throw new BadRequestException("抽帧间隔必须为 1 至 5 秒");
    }
  }

  if (inputType === "archive") {
    if (normalizedFiles.length !== 1 || extensionOf(normalizedFiles[0]) !== ".zip") {
      throw new BadRequestException("图片包任务必须上传一个 ZIP 文件");
    }
  }

  if (inputType === "images") {
    if (normalizedFiles.length === 0) throw new BadRequestException("请至少选择一张图片");
    if (normalizedFiles.length > 500) throw new BadRequestException("单个任务最多上传 500 张图片");
    if (normalizedFiles.some((file) => !imageExtensions.has(extensionOf(file)))) {
      throw new BadRequestException("图片仅支持 JPG、JPEG 或 PNG 格式");
    }
  }

  return {
    name,
    taskDate,
    sourceType: body.sourceType as TaskSourceType,
    inputType,
    intervalSeconds,
    files: normalizedFiles,
  };
}

function parseTaskDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException("任务日期格式无效");
  }
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new BadRequestException("任务日期格式无效");
  return date;
}

function extensionOf(file: TaskUploadFile) {
  return extname(file.originalname).toLowerCase();
}
