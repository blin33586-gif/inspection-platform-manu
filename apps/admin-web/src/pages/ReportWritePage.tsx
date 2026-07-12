import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Button, DatePicker, Input, message, QRCode, Select, Space, Upload } from "antd";
import {
  ArrowUpRight,
  ImagePlus,
  Images,
  Maximize2,
  Move,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Save,
  Send,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ReportSummary } from "@xunjianbao/shared";
import { getApi, getApiUrl, postJsonApi } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { TaskPhotoSelector, type SelectableTaskPhoto } from "../components/TaskPhotoSelector";
import type { InspectionTaskRecord } from "./inspection-task-presenter";
import {
  effectiveReportTaskPhotoIds,
  mergeReportTaskOptions,
  toEditableReportDraft,
} from "./report-edit-state";
import { toReportPhoto } from "./report-media-adapter";

type ToolKey = "pointer" | "move" | "rect" | "arrow" | "text";
type AnnotationShape = Exclude<ToolKey, "pointer" | "move">;
type AnnotationTone = "danger" | "warning" | "info";

interface PhotoItem {
  id: number;
  taskPhotoId?: string;
  label: string;
  state: "已标注" | "待标注";
  variant: string;
  url?: string;
  fileName?: string;
  fileSize?: number;
  uploadedAt?: string;
}

type ReportTaskOption = Pick<
  InspectionTaskRecord,
  "id" | "name" | "taskDate" | "processStatus" | "report"
>;

interface ReportAnnotation {
  id: number;
  photoId: number;
  title: string;
  tone: AnnotationTone;
  shape: AnnotationShape;
  x: number;
  y: number;
  width: number;
  height: number;
  position: string;
  description: string;
  lineStartX?: number;
  lineStartY?: number;
  lineEndX?: number;
  lineEndY?: number;
}

interface DraftAnnotation {
  shape: AnnotationShape;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface AnnotationBox {
  x: number;
  y: number;
  width: number;
  height: number;
  lineStartX?: number;
  lineStartY?: number;
  lineEndX?: number;
  lineEndY?: number;
}

interface MovingAnnotation {
  id: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
}

const initialAnnotations: ReportAnnotation[] = [];
const initialPhotoItems: PhotoItem[] = [];
const defaultCoordinateText = "31.288210, 121.491320";
const defaultReportArea = "曲阳路街道重点区域";

const toolItems: { key: ToolKey; label: string; icon: typeof MousePointer2 }[] = [
  { key: "pointer", label: "选择", icon: MousePointer2 },
  { key: "move", label: "移动", icon: Move },
  { key: "rect", label: "矩形框", icon: Square },
  { key: "arrow", label: "箭头", icon: ArrowUpRight },
  { key: "text", label: "文字", icon: Type },
];

const shapeTone: Record<AnnotationShape, AnnotationTone> = {
  rect: "danger",
  arrow: "warning",
  text: "info",
};

const shapeTitle: Record<AnnotationShape, string> = {
  rect: "矩形问题框",
  arrow: "箭头指示",
  text: "文字说明",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildPosition(box: AnnotationBox) {
  return `X: ${Math.round(box.x * 12)}    Y: ${Math.round(box.y * 7)}    W: ${Math.round(box.width * 12)}    H: ${Math.round(box.height * 7)}`;
}

function measureTextAnnotation(title: string) {
  const text = title.trim() || "文字";
  const visualLength = Array.from(text).reduce((sum, char) => (
    /[\u4e00-\u9fff]/.test(char) ? sum + 1 : sum + 0.58
  ), 0);

  return {
    width: clamp(5 + visualLength * 2.1, 8, 46),
    height: clamp(5 + Math.floor(visualLength / 14) * 3, 5, 14),
  };
}

function fitBoxToCanvas(box: AnnotationBox): AnnotationBox {
  return {
    ...box,
    x: clamp(box.x, 1, 99 - box.width),
    y: clamp(box.y, 1, 99 - box.height),
  };
}

function normalizeBox(draft: DraftAnnotation): AnnotationBox {
  if (draft.shape === "arrow") {
    const dx = draft.currentX - draft.startX;
    const dy = draft.currentY - draft.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const minLength = 4;
    const width = clamp(absDx < 1 ? minLength : absDx, minLength, 76);
    const height = clamp(absDy < 1 ? minLength : absDy, minLength, 76);
    const rawX = Math.min(draft.startX, draft.currentX);
    const rawY = Math.min(draft.startY, draft.currentY);
    const isHorizontal = absDy < 1;
    const isVertical = absDx < 1;

    return {
      x: clamp(rawX, 1, 99 - width),
      y: clamp(rawY, 1, 99 - height),
      width,
      height,
      lineStartX: isVertical ? 50 : dx >= 0 ? 0 : 100,
      lineStartY: isHorizontal ? 50 : dy >= 0 ? 0 : 100,
      lineEndX: isVertical ? 50 : dx >= 0 ? 100 : 0,
      lineEndY: isHorizontal ? 50 : dy >= 0 ? 100 : 0,
    };
  }

  const minWidth = draft.shape === "text" ? 8 : 4;
  const minHeight = draft.shape === "text" ? 5 : 4;
  const rawX = Math.min(draft.startX, draft.currentX);
  const rawY = Math.min(draft.startY, draft.currentY);
  const rawWidth = Math.abs(draft.currentX - draft.startX);
  const rawHeight = Math.abs(draft.currentY - draft.startY);
  const width = clamp(rawWidth < 1 ? minWidth : rawWidth, minWidth, 48);
  const height = clamp(rawHeight < 1 ? minHeight : rawHeight, minHeight, 32);
  const x = clamp(rawX, 1, 99 - width);
  const y = clamp(rawY, 1, 99 - height);

  return { x, y, width, height };
}

function shortenName(name: string) {
  return name.length > 12 ? `${name.slice(0, 9)}...` : name;
}

function formatFileSize(size?: number) {
  if (!size) return "-";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function parseCoordinateText(value: string) {
  const numbers = value.match(/-?\d+(?:\.\d+)?/g);

  if (!numbers || numbers.length < 2) return null;

  const latitude = Number(numbers[0]);
  const longitude = Number(numbers[1]);
  const isValidLatitude = Number.isFinite(latitude) && Math.abs(latitude) <= 90;
  const isValidLongitude = Number.isFinite(longitude) && Math.abs(longitude) <= 180;

  if (!isValidLatitude || !isValidLongitude) return null;

  return { latitude, longitude };
}

function buildMapLocationUrl(coordinateText: string, title: string) {
  const coordinate = parseCoordinateText(coordinateText);

  if (!coordinate) return "";

  const marker = encodeURIComponent(`coord:${coordinate.latitude},${coordinate.longitude};title:${title};addr:${title}`);

  return `https://apis.map.qq.com/uri/v1/marker?marker=${marker}&referer=xunjianbao`;
}

function getTodayDateString() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);

  return localTime.toISOString().slice(0, 10);
}

function getPointFromEvent(event: PointerEvent<HTMLDivElement>) {
  const rect = event.currentTarget.getBoundingClientRect();

  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
  };
}

export function ReportWritePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preferredMediaId = searchParams.get("mediaId");
  const taskIdFromQuery = searchParams.get("taskId");
  const objectUrlsRef = useRef<string[]>([]);
  const nextPhotoIdRef = useRef(initialPhotoItems.length + 1);
  const photoCanvasRef = useRef<HTMLDivElement | null>(null);
  const [reportTitle, setReportTitle] = useState("曲阳路街道无人机巡检报告");
  const [reportDate, setReportDate] = useState(getTodayDateString());
  const [selectedTaskId, setSelectedTaskId] = useState(taskIdFromQuery ?? "");
  const [taskOptions, setTaskOptions] = useState<ReportTaskOption[]>([]);
  const [photoSelectorOpen, setPhotoSelectorOpen] = useState(false);
  const [selectionInitializedTaskId, setSelectionInitializedTaskId] = useState<string | null>(null);
  const [restoredReportTaskId, setRestoredReportTaskId] = useState<string | null>(null);
  const [restoredTaskPhotoIds, setRestoredTaskPhotoIds] = useState<string[]>([]);
  const [restoredIssueCount, setRestoredIssueCount] = useState(0);
  const [restoredContentSummary, setRestoredContentSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportArea, setReportArea] = useState(defaultReportArea);
  const [activeTool, setActiveTool] = useState<ToolKey>("rect");
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotoItems);
  const [activePhotoId, setActivePhotoId] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<ReportAnnotation[]>(initialAnnotations);
  const [draftBox, setDraftBox] = useState<DraftAnnotation | null>(null);
  const [movingAnnotation, setMovingAnnotation] = useState<MovingAnnotation | null>(null);
  const [photoDescriptions, setPhotoDescriptions] = useState<Record<number, string>>({});
  const [photoCoordinates, setPhotoCoordinates] = useState<Record<number, string>>({});

  const selectedTask = useMemo(
    () => taskOptions.find((item) => item.id === selectedTaskId) ?? null,
    [selectedTaskId, taskOptions],
  );
  const selectedTaskPhotoIds = useMemo(
    () => photos.flatMap((photo) => photo.taskPhotoId ? [photo.taskPhotoId] : []),
    [photos],
  );
  const effectiveTaskPhotoIds = useMemo(() => effectiveReportTaskPhotoIds({
    currentTaskId: selectedTaskId,
    workspaceTaskId: selectionInitializedTaskId,
    workspacePhotoIds: selectedTaskPhotoIds,
    restoredTaskId: restoredReportTaskId,
    restoredPhotoIds: restoredTaskPhotoIds,
  }), [
    restoredReportTaskId,
    restoredTaskPhotoIds,
    selectedTaskId,
    selectedTaskPhotoIds,
    selectionInitializedTaskId,
  ]);
  const selectorSelectionInitialized = selectionInitializedTaskId === selectedTaskId
    || restoredReportTaskId === selectedTaskId;
  const selectorInitialSelectedIds = selectionInitializedTaskId === selectedTaskId
    ? selectedTaskPhotoIds
    : restoredReportTaskId === selectedTaskId
      ? restoredTaskPhotoIds
      : [];

  const clearReportWorkspace = () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
    nextPhotoIdRef.current = 1;
    setPhotos([]);
    setActivePhotoId(null);
    setAnnotations([]);
    setPhotoDescriptions({});
    setPhotoCoordinates({});
  };

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const taskPage = getApi<{ items: InspectionTaskRecord[] }>(
      "/inspection-tasks?pageSize=100",
      controller.signal,
    );
    const directTask = taskIdFromQuery
      ? getApi<ReportTaskOption>(`/inspection-tasks/${encodeURIComponent(taskIdFromQuery)}`, controller.signal)
      : Promise.resolve(null);

    void Promise.all([taskPage, directTask])
      .then(([result, loadedTask]) => {
        const options = mergeReportTaskOptions<ReportTaskOption>(result.items, loadedTask);
        setTaskOptions(options);
        if (loadedTask) setSelectedTaskId(loadedTask.id);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        message.error("任务列表读取失败");
      });
    return () => controller.abort();
  }, [taskIdFromQuery]);

  useEffect(() => {
    if (!selectedTask) return;
    const controller = new AbortController();

    clearReportWorkspace();
    setSelectionInitializedTaskId(null);
    setRestoredReportTaskId(null);
    setRestoredTaskPhotoIds([]);
    setRestoredIssueCount(0);
    setRestoredContentSummary("");
    setReportTitle(`${selectedTask.name}综合报告`);
    setReportDate(selectedTask.taskDate.slice(0, 10));
    setReportArea(defaultReportArea);
    setPhotoSelectorOpen(false);

    if (!selectedTask.report?.id) {
      setPhotoSelectorOpen(true);
      return () => controller.abort();
    }

    void getApi<ReportSummary>(`/reports/${encodeURIComponent(selectedTask.report.id)}`, controller.signal)
      .then((report) => {
        const draft = toEditableReportDraft(report);
        setReportTitle(draft.title);
        setReportDate(draft.reportDate);
        setReportArea(draft.reportArea);
        setRestoredTaskPhotoIds(draft.taskPhotoIds);
        setRestoredIssueCount(draft.issueCount);
        setRestoredContentSummary(draft.contentSummary);
        setRestoredReportTaskId(selectedTask.id);
        setPhotoSelectorOpen(true);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        message.error(error instanceof Error ? error.message : "已有报告读取失败");
      });

    return () => controller.abort();
  }, [selectedTask?.id, selectedTask?.report?.id]);

  const activePhoto = photos.find((item) => item.id === activePhotoId);
  const activePhotoAnnotations = activePhoto ? annotations.filter((item) => item.photoId === activePhoto.id) : [];
  const activePhotoIndex = activePhoto ? photos.findIndex((item) => item.id === activePhoto.id) : -1;
  const activeDescription = activePhoto ? photoDescriptions[activePhoto.id] ?? "" : "";
  const activeCoordinateText = activePhoto ? photoCoordinates[activePhoto.id] ?? "" : "";
  const activeMapUrl = activePhoto ? buildMapLocationUrl(activeCoordinateText, activePhoto.fileName ?? "巡检照片位置") : "";
  const hasNextPhoto = activePhotoIndex >= 0 && activePhotoIndex < photos.length - 1;
  const activeToolLabel = useMemo(() => toolItems.find((item) => item.key === activeTool)?.label ?? "矩形框", [activeTool]);
  const annotationTotal = activePhotoAnnotations.length;

  const markActivePhotoAnnotated = (nextAnnotations: ReportAnnotation[]) => {
    if (!activePhoto) return;

    const hasActivePhotoAnnotations = nextAnnotations.some((item) => item.photoId === activePhoto.id);

    setPhotos((current) => (
      current.map((photo) => (
        photo.id === activePhoto.id ? { ...photo, state: hasActivePhotoAnnotations ? "已标注" : "待标注" } : photo
      ))
    ));
  };

  const createAnnotation = (shape: AnnotationShape, box: AnnotationBox, feedback = "已添加标注") => {
    if (!activePhoto) {
      message.warning("请先上传图片");
      return;
    }

    const nextId = annotations.length ? Math.max(...annotations.map((item) => item.id)) + 1 : 1;
    const title = `${shapeTitle[shape]} ${nextId}`;
    const measuredBox = shape === "text" ? fitBoxToCanvas({ ...box, ...measureTextAnnotation(title) }) : box;
    const nextAnnotation: ReportAnnotation = {
      id: nextId,
      photoId: activePhoto.id,
      title,
      tone: shapeTone[shape],
      shape,
      ...measuredBox,
      position: buildPosition(measuredBox),
      description: `使用${shapeTitle[shape]}工具添加的问题标注`,
    };
    const nextAnnotations = [...annotations, nextAnnotation];

    setAnnotations(nextAnnotations);
    markActivePhotoAnnotated(nextAnnotations);
    message.success(feedback);
  };

  const addAnnotation = () => {
    if (!activePhoto) {
      message.warning("请先上传图片");
      return;
    }

    const shape: AnnotationShape = activeTool === "arrow" || activeTool === "text" ? activeTool : "rect";

    createAnnotation(shape, {
      x: 42,
      y: 38,
      width: shape === "arrow" ? 10 : shape === "text" ? 10 : 6,
      height: shape === "text" ? 6 : 5,
      lineStartX: shape === "arrow" ? 0 : undefined,
      lineStartY: shape === "arrow" ? 50 : undefined,
      lineEndX: shape === "arrow" ? 100 : undefined,
      lineEndY: shape === "arrow" ? 50 : undefined,
    });
  };

  const removeAnnotation = (id: number) => {
    const nextAnnotations = annotations.filter((item) => item.id !== id);

    setAnnotations(nextAnnotations);
    markActivePhotoAnnotated(nextAnnotations);
    message.success("已删除标注");
  };

  const updateAnnotation = (id: number, patch: Partial<Pick<ReportAnnotation, "title" | "description">>) => {
    setAnnotations((current) => (
      current.map((item) => {
        if (item.id !== id) return item;

        const nextItem = { ...item, ...patch };

        if (item.shape === "text" && patch.title !== undefined) {
          const nextBox = fitBoxToCanvas({ ...nextItem, ...measureTextAnnotation(patch.title) });

          return {
            ...nextItem,
            ...nextBox,
            position: buildPosition(nextBox),
          };
        }

        return nextItem;
      })
    ));
  };

  const updateAnnotationPosition = (id: number, x: number, y: number) => {
    setAnnotations((current) => (
      current.map((item) => {
        if (item.id !== id) return item;

        const nextBox = { ...item, x, y };

        return {
          ...item,
          x,
          y,
          position: buildPosition(nextBox),
        };
      })
    ));
  };

  const clearAnnotations = () => {
    if (!activePhoto) {
      message.warning("请先上传图片");
      return;
    }

    const nextAnnotations = annotations.filter((item) => item.photoId !== activePhoto.id);

    setAnnotations(nextAnnotations);
    markActivePhotoAnnotated(nextAnnotations);
    message.success("当前照片标注已清空");
  };

  const handleTaskChange = (value: string) => {
    setSelectedTaskId(value);
  };

  const applyTaskPhotoSelection = (selectedPhotos: SelectableTaskPhoto[]) => {
    const existingByTaskPhotoId = new Map(
      photos.filter((photo) => photo.taskPhotoId).map((photo) => [photo.taskPhotoId, photo]),
    );
    const manualPhotos = photos.filter((photo) => !photo.taskPhotoId);
    const taskPhotos = selectedPhotos.map((taskPhoto) => {
      const existing = existingByTaskPhotoId.get(taskPhoto.id);
      if (existing) return existing;
      const nextId = nextPhotoIdRef.current;
      nextPhotoIdRef.current += 1;
      return {
        ...toReportPhoto(
          taskPhoto.mediaAsset,
          nextId,
          getApiUrl(`/media-assets/${taskPhoto.mediaAsset.id}/content`),
        ),
        taskPhotoId: taskPhoto.id,
      };
    });
    const nextPhotos = [...taskPhotos, ...manualPhotos];
    const retainedPhotoIds = new Set(nextPhotos.map((photo) => photo.id));

    setPhotos(nextPhotos);
    setAnnotations((current) => current.filter((item) => retainedPhotoIds.has(item.photoId)));
    setPhotoDescriptions((current) => Object.fromEntries(
      Object.entries(current).filter(([photoId]) => retainedPhotoIds.has(Number(photoId))),
    ));
    setPhotoCoordinates((current) => {
      const retained = Object.fromEntries(
        Object.entries(current).filter(([photoId]) => retainedPhotoIds.has(Number(photoId))),
      );
      taskPhotos.forEach((photo) => {
        if (!retained[photo.id]) retained[photo.id] = defaultCoordinateText;
      });
      return retained;
    });
    setActivePhotoId((current) => (
      current !== null && retainedPhotoIds.has(current) ? current : nextPhotos[0]?.id ?? null
    ));
    setSelectionInitializedTaskId(selectedTaskId);
    setRestoredTaskPhotoIds(taskPhotos.map((photo) => photo.taskPhotoId!));
    setRestoredReportTaskId(selectedTaskId);
    setPhotoSelectorOpen(false);
    message.success(`已载入 ${taskPhotos.length} 张任务照片`);
  };

  const saveDraft = () => {
    message.success("草稿已保存");
  };

  const submitReport = async () => {
    const normalizedTitle = reportTitle.trim();
    const normalizedDate = reportDate.trim();
    const normalizedArea = reportArea.trim();

    if (!normalizedTitle) {
      message.warning("请填写报告名称");
      return;
    }

    if (!normalizedDate) {
      message.warning("请选择巡检日期");
      return;
    }

    if (!normalizedArea) {
      message.warning("请填写巡检区域");
      return;
    }
    if (!selectedTaskId || !selectedTask) {
      message.warning("请选择报告所属任务");
      return;
    }

    setSubmitting(true);
    try {
      await postJsonApi("/reports", {
        taskId: selectedTaskId,
        taskPhotoIds: effectiveTaskPhotoIds,
        title: normalizedTitle,
        reportDate: normalizedDate,
        relatedObjectName: normalizedArea,
        issueCount: Math.max(restoredIssueCount, annotations.length),
        contentSummary: Object.values(photoDescriptions).filter(Boolean).join("\n") || restoredContentSummary,
      });
      message.success("综合报告已提交，并同步到报告管理");
      navigate("/reports");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "报告提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const updateActiveDescription = (value: string) => {
    if (!activePhoto) return;

    setPhotoDescriptions((current) => ({
      ...current,
      [activePhoto.id]: value,
    }));
  };

  const updateActiveCoordinate = (value: string) => {
    if (!activePhoto) return;

    setPhotoCoordinates((current) => ({
      ...current,
      [activePhoto.id]: value,
    }));
  };

  const saveActiveDescription = () => {
    if (!activePhoto) {
      message.warning("请先上传图片");
      return;
    }

    message.success(`第 ${activePhoto.id} 张图片说明已暂存`);
  };

  const goToNextPhoto = () => {
    if (!activePhoto) {
      message.warning("请先上传图片");
      return;
    }

    if (!hasNextPhoto) {
      message.info("已经是最后一张图片");
      return;
    }

    setActivePhotoId(photos[activePhotoIndex + 1].id);
    message.success("已切换到下一张图片，请填写对应说明");
  };

  const handleUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    const nextId = nextPhotoIdRef.current;
    const uploadedPhoto: PhotoItem = {
      id: nextId,
      label: shortenName(file.name),
      state: "待标注",
      variant: "uploaded",
      url,
      fileName: file.name,
      fileSize: file.size,
      uploadedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    };

    nextPhotoIdRef.current += 1;
    objectUrlsRef.current.push(url);
    setPhotos((current) => [...current, uploadedPhoto]);
    setPhotoCoordinates((current) => ({ ...current, [nextId]: defaultCoordinateText }));
    setActivePhotoId(nextId);
    message.success(`${file.name} 已显示到报告编写区`);
    return false;
  };

  const getCanvasPointFromClient = (clientX: number, clientY: number) => {
    const rect = photoCanvasRef.current?.getBoundingClientRect();

    if (!rect) return null;

    return {
      x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  };

  const handlePhotoPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!activePhoto) return;
    if (activeTool === "pointer" || activeTool === "move") return;

    const point = getPointFromEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();

    if (activeTool === "text") {
      createAnnotation("text", {
        x: clamp(point.x, 1, 90),
        y: clamp(point.y, 1, 94),
        width: 8,
        height: 5,
      }, "已添加文字标注");
      return;
    }

    setDraftBox({
      shape: activeTool,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  };

  const handlePhotoPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (movingAnnotation) {
      const point = getCanvasPointFromClient(event.clientX, event.clientY);

      if (!point) return;

      const nextX = clamp(movingAnnotation.originX + point.x - movingAnnotation.startX, 1, 99 - movingAnnotation.width);
      const nextY = clamp(movingAnnotation.originY + point.y - movingAnnotation.startY, 1, 99 - movingAnnotation.height);

      updateAnnotationPosition(movingAnnotation.id, nextX, nextY);
      return;
    }

    if (!draftBox) return;

    const point = getPointFromEvent(event);
    setDraftBox({ ...draftBox, currentX: point.x, currentY: point.y });
  };

  const handlePhotoPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (movingAnnotation) {
      setMovingAnnotation(null);
      message.success("标注位置已更新");
      return;
    }

    if (!draftBox) return;

    const point = getPointFromEvent(event);
    const completedDraft = { ...draftBox, currentX: point.x, currentY: point.y };
    const box = normalizeBox(completedDraft);

    setDraftBox(null);
    createAnnotation(completedDraft.shape, box, `已用${activeToolLabel}新增标注`);
  };

  const handleAnnotationPointerDown = (event: PointerEvent<HTMLDivElement>, item: ReportAnnotation, preview: boolean) => {
    if (preview || activeTool !== "move") return;

    const point = getCanvasPointFromClient(event.clientX, event.clientY);

    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    photoCanvasRef.current?.setPointerCapture(event.pointerId);
    setMovingAnnotation({
      id: item.id,
      startX: point.x,
      startY: point.y,
      originX: item.x,
      originY: item.y,
      width: item.width,
      height: item.height,
    });
  };

  const renderAnnotation = (item: ReportAnnotation, preview = false) => (
    <div
      className={`annotation-frame annotation-${item.tone} annotation-shape-${item.shape}${preview ? " annotation-preview" : ""}${activeTool === "move" && !preview ? " annotation-movable" : ""}${movingAnnotation?.id === item.id ? " annotation-moving" : ""}`}
      key={preview ? "preview" : item.id}
      style={{
        left: `${item.x}%`,
        top: `${item.y}%`,
        width: `${item.width}%`,
        height: `${item.height}%`,
      }}
      onPointerDown={(event) => handleAnnotationPointerDown(event, item, preview)}
    >
      {item.shape === "arrow" ? (
        <svg className="annotation-arrow-svg" preserveAspectRatio="none" viewBox="0 0 100 100">
          <defs>
            <marker id={`arrowhead-${preview ? "preview" : item.id}`} markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
              <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
            </marker>
          </defs>
          <line
            markerEnd={`url(#arrowhead-${preview ? "preview" : item.id})`}
            x1={item.lineStartX ?? 0}
            x2={item.lineEndX ?? 100}
            y1={item.lineStartY ?? 50}
            y2={item.lineEndY ?? 50}
          />
        </svg>
      ) : null}
      {preview ? (
        <strong>{item.title}</strong>
      ) : (
        <input
          aria-label={`${item.title}标题`}
          className="annotation-label-input"
          value={item.title}
          onChange={(event) => updateAnnotation(item.id, { title: event.target.value })}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        />
      )}
    </div>
  );

  const draftAnnotation = draftBox
    ? {
      id: -1,
      photoId: activePhoto?.id ?? 0,
      title: activeToolLabel,
      tone: shapeTone[draftBox.shape],
      shape: draftBox.shape,
      ...normalizeBox(draftBox),
      position: "",
      description: "",
    }
    : null;

  return (
    <>
      <PageHeader
        title="报告编写"
        description="上传巡检照片、标注问题并填写说明"
        actions={(
          <Space className="report-write-top-actions" size={12}>
            <Button href="/reports">返回报告管理</Button>
            <Upload accept="image/*" multiple showUploadList={false} beforeUpload={handleUpload}>
              <Button type="primary" icon={<ImagePlus size={16} />}>多选上传图片</Button>
            </Upload>
            <Button icon={<Save size={16} />} onClick={saveDraft}>保存草稿</Button>
            <Button disabled={!selectedTask} loading={submitting} type="primary" icon={<Send size={16} />} onClick={() => void submitReport()}>提交报告</Button>
          </Space>
        )}
      />

      <section className="report-write-page">
        <div className="report-write-basic">
          <label className="write-field">
            <span>报告名称 <em>*</em></span>
            <Input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} />
          </label>
          <label className="write-field">
            <span>巡检日期 <em>*</em></span>
            <DatePicker
              placeholder={reportDate}
              style={{ width: "100%" }}
              onChange={(_, dateString) => {
                setReportDate(Array.isArray(dateString) ? dateString[0] ?? "" : dateString);
              }}
            />
          </label>
          <label className="write-field">
            <span>所属任务 <em>*</em></span>
            <div className="report-task-photo-field">
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="选择一个巡检任务"
                value={selectedTaskId || undefined}
                onChange={handleTaskChange}
                options={taskOptions.map((item) => ({ label: `${item.taskDate.slice(0, 10)} · ${item.name}`, value: item.id }))}
              />
              <Button
                disabled={!selectedTask}
                icon={<Images size={16} />}
                onClick={() => setPhotoSelectorOpen(true)}
              >
                选择照片 {effectiveTaskPhotoIds.length ? `(${effectiveTaskPhotoIds.length})` : ""}
              </Button>
            </div>
          </label>
          <label className="write-field">
            <span>巡检区域 <em>*</em></span>
            <Input value={reportArea} onChange={(event) => setReportArea(event.target.value)} />
          </label>
        </div>

        <div className="report-write-workspace">
          <article className="report-photo-editor">
            <div className="report-editor-toolbar">
              {toolItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    className={activeTool === item.key ? "active" : ""}
                    key={item.key}
                    type="button"
                    onClick={() => setActiveTool(item.key)}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
              <span className="toolbar-divider" />
              <button type="button" onClick={() => message.info("已撤销上一步标注")}>
                <Undo2 size={16} />
                撤销
              </button>
              <button type="button" onClick={() => message.info("已恢复上一步标注")}>
                <Redo2 size={16} />
                恢复
              </button>
              <span className="toolbar-divider" />
              <button type="button" onClick={() => message.info("画布已缩小")}>
                <ZoomOut size={16} />
                缩小
              </button>
              <button type="button" onClick={() => message.info("画布已放大")}>
                <ZoomIn size={16} />
                放大
              </button>
              <button type="button" onClick={() => message.info("已适应窗口")}>
                <Maximize2 size={16} />
                适应窗口
              </button>
              <button type="button" onClick={clearAnnotations}>
                <Trash2 size={16} />
                清空标注
              </button>
            </div>

            <div
              ref={photoCanvasRef}
              aria-label="报告图片标注画布"
              className={`inspection-photo ${activePhoto ? `inspection-photo-${activePhoto.variant}` : "inspection-photo-empty"} tool-${activeTool}`}
              onPointerDown={handlePhotoPointerDown}
              onPointerMove={handlePhotoPointerMove}
              onPointerUp={handlePhotoPointerUp}
              role="application"
            >
              {!activePhoto ? (
                <div className="empty-photo-upload">
                  <Upload accept="image/*" multiple showUploadList={false} beforeUpload={handleUpload}>
                    <Button type="primary" icon={<ImagePlus size={18} />}>点击上传图片</Button>
                  </Upload>
                  <span>支持 JPG、PNG、WEBP 等巡检照片</span>
                </div>
              ) : activePhoto.url ? (
                <img alt={activePhoto.fileName ?? activePhoto.label} className="inspection-photo-image" draggable={false} src={activePhoto.url} />
              ) : (
                <>
                  <div className="photo-horizon" />
                  <div className="tower-structure">
                    <span className="tower-leg left" />
                    <span className="tower-leg right" />
                    <span className="tower-cross top" />
                    <span className="tower-cross middle" />
                    <span className="tower-cross bottom" />
                    <span className="tower-cable cable-a" />
                    <span className="tower-cable cable-b" />
                  </div>
                </>
              )}
              {activePhoto && activePhotoAnnotations.length ? (
                activePhotoAnnotations.map((item) => renderAnnotation(item))
              ) : null}
              {draftAnnotation ? renderAnnotation(draftAnnotation, true) : null}
            </div>

            <div className="photo-strip">
              {photos.length ? photos.map((item) => (
                <button
                  className={activePhoto?.id === item.id ? "active" : ""}
                  key={item.id}
                  type="button"
                  onClick={() => setActivePhotoId(item.id)}
                >
                  {item.url ? (
                    <img alt={item.fileName ?? item.label} className="thumb-image" src={item.url} />
                  ) : (
                    <span className={`thumb-visual thumb-${item.variant}`} />
                  )}
                  <strong>{item.id}</strong>
                  <em>{item.state}</em>
                </button>
              )) : <div className="photo-strip-empty">上传后图片会显示在这里</div>}
            </div>

            <label className="report-description-box">
              <div className="report-description-head">
                <span>图片说明 / 问题描述 <em>*</em></span>
                <Space className="report-description-actions" size={10}>
                  <Button disabled={!activePhoto} onClick={saveActiveDescription}>暂存</Button>
                  <Button disabled={!hasNextPhoto} type="primary" onClick={goToNextPhoto}>下一张</Button>
                </Space>
              </div>
              <Input.TextArea
                maxLength={2000}
                placeholder={activePhoto ? `填写第 ${activePhoto.id} 张图片的问题描述` : "请先上传图片"}
                rows={6}
                showCount
                value={activeDescription}
                onChange={(event) => updateActiveDescription(event.target.value)}
              />
            </label>
          </article>

          <aside className="annotation-side-panel">
            <div className="annotation-side-tabs">
              <button className="active" type="button">标注列表</button>
            </div>
            <div className="annotation-list-head">
              <span>当前照片已添加 {annotationTotal} 个标注</span>
              <button type="button" onClick={clearAnnotations}>清空</button>
            </div>
            <div className="annotation-list">
              {activePhoto ? activePhotoAnnotations.map((item) => (
                <article className={`annotation-item ${item.tone}`} key={item.id}>
                  <div>
                    <mark>{item.id}</mark>
                    <Input
                      className="annotation-title-input"
                      value={item.title}
                      onChange={(event) => updateAnnotation(item.id, { title: event.target.value })}
                    />
                  </div>
                  <p>位置　{item.position}</p>
                  <Input.TextArea
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    className="annotation-description-input"
                    value={item.description}
                    onChange={(event) => updateAnnotation(item.id, { description: event.target.value })}
                  />
                  <button type="button" onClick={() => removeAnnotation(item.id)} aria-label={`删除${item.title}`}>
                    <Trash2 size={15} />
                  </button>
                </article>
              )) : <div className="annotation-empty-note">请先上传图片，再添加标注</div>}
            </div>
            <Button block disabled={!activePhoto} icon={<Plus size={16} />} onClick={addAnnotation}>添加标注</Button>

            <div className="photo-info-panel">
              <h3>照片信息</h3>
              <div className="photo-info-content">
                <dl>
                  <div>
                    <dt>文件名</dt>
                    <dd>{activePhoto?.fileName ?? "暂无图片"}</dd>
                  </div>
                  <div>
                    <dt>拍摄时间</dt>
                    <dd>{activePhoto?.uploadedAt ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>拍摄设备</dt>
                    <dd>{activePhoto?.url ? "本地上传图片" : "-"}</dd>
                  </div>
                  <div>
                    <dt>文件大小</dt>
                    <dd>{formatFileSize(activePhoto?.fileSize)}</dd>
                  </div>
                  <div>
                    <dt>经纬度</dt>
                    <dd>
                      <Input
                        className="coordinate-input"
                        disabled={!activePhoto}
                        placeholder="纬度, 经度"
                        value={activeCoordinateText}
                        onChange={(event) => updateActiveCoordinate(event.target.value)}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>高度</dt>
                    <dd>{activePhoto?.url ? "待读取" : "-"}</dd>
                  </div>
                </dl>
                <div className="location-qr-card">
                  <QRCode
                    bordered={false}
                    errorLevel="M"
                    size={132}
                    status={activeMapUrl ? "active" : "expired"}
                    statusRender={() => <span>暂无经纬度</span>}
                    value={activeMapUrl || "https://map.qq.com"}
                  />
                  <strong>扫码查看地图位置</strong>
                  <span>{activeCoordinateText || "上传图片后填写经纬度"}</span>
                  {activeMapUrl ? (
                    <Button href={activeMapUrl} size="small" target="_blank">打开地图</Button>
                  ) : (
                    <Button disabled size="small">打开地图</Button>
                  )}
                </div>
              </div>
              <Button icon={<Pencil size={16} />} onClick={() => message.info("照片备注入口已预留")}>编辑备注</Button>
            </div>
          </aside>
        </div>
      </section>

      <TaskPhotoSelector
        initialSelectedIds={selectorInitialSelectedIds}
        open={photoSelectorOpen}
        preferredMediaId={preferredMediaId}
        selectionInitialized={selectorSelectionInitialized}
        task={selectedTask}
        onCancel={() => setPhotoSelectorOpen(false)}
        onConfirm={applyTaskPhotoSelection}
      />
    </>
  );
}
