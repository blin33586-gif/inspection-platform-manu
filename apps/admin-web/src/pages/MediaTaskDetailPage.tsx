import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, message, Modal, Progress, Select, Spin, Tag } from "antd";
import { ArrowLeft, CalendarDays, FileArchive, FileText, FileVideo2, Images, RadioTower } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { getApi, getApiUrl, patchJsonApi } from "../api/client";
import { ApiResourceError } from "../components/ApiResourceError";
import { MediaAssetGallery } from "../components/MediaAssetGallery";
import { toMediaGalleryItem, type MediaGalleryItem } from "../components/media-asset-presenter";
import { toInspectionTaskViewModel, type InspectionTaskRecord } from "./inspection-task-presenter";
import "./media-library-detail.css";

interface TaskDetailRecord extends Omit<InspectionTaskRecord, "photos"> {
  report: ({ id: string; processStatus: string } & Record<string, unknown>) | null;
}

interface TaskPhotoRecord {
  id: string;
  distributionStatus: string;
  archiveObjectId: string | null;
  archiveObject: { id: string; name: string; objectType: string } | null;
  videoTimestampMs: number | null;
  mediaAsset: {
    id: string;
    kind: "frame" | "image";
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    videoTimestampMs: number | null;
    createdAt: string;
  };
}

interface TaskPhotoPage {
  items: TaskPhotoRecord[];
  page: number;
  pageSize: number;
  total: number;
}

interface DetailState {
  task: TaskDetailRecord | null;
  photos: TaskPhotoRecord[];
  loading: boolean;
  error: Error | null;
}

const initialState: DetailState = { task: null, photos: [], loading: true, error: null };

interface ArchiveOption {
  id: string;
  name: string;
  objectType: string;
}

export function MediaTaskDetailPage() {
  const { taskId = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<DetailState>(initialState);
  const [distributionItem, setDistributionItem] = useState<MediaGalleryItem | null>(null);
  const [archiveOptions, setArchiveOptions] = useState<ArchiveOption[]>([]);
  const [archiveObjectId, setArchiveObjectId] = useState<string>();
  const [savingDistribution, setSavingDistribution] = useState(false);

  const loadTask = useCallback((signal?: AbortSignal) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    return Promise.all([
      getApi<TaskDetailRecord>(`/inspection-tasks/${encodeURIComponent(taskId)}`, signal),
      getApi<TaskPhotoPage>(`/inspection-tasks/${encodeURIComponent(taskId)}/photos?pageSize=100`, signal),
    ]).then(([task, photos]) => {
      setState({ task, photos: photos.items, loading: false, error: null });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error : new Error("任务加载失败"),
      }));
    });
  }, [taskId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadTask(controller.signal);
    return () => controller.abort();
  }, [loadTask]);

  useEffect(() => {
    if (!state.task || !new Set(["queued", "running"]).has(state.task.processStatus)) return;
    const timer = window.setInterval(() => void loadTask(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadTask, state.task]);

  const items = useMemo<MediaGalleryItem[]>(() => state.photos.map((photo) => ({
    ...toMediaGalleryItem(
      { ...photo.mediaAsset, videoTimestampMs: photo.videoTimestampMs ?? photo.mediaAsset.videoTimestampMs },
      getApiUrl(`/media-assets/${photo.mediaAsset.id}/content`),
    ),
    taskPhotoId: photo.id,
    distributionStatus: photo.distributionStatus,
    archiveObjectId: photo.archiveObjectId,
    archiveObjectName: photo.archiveObject?.name ?? null,
  })), [state.photos]);

  const openDistribution = async (item: MediaGalleryItem) => {
    setDistributionItem(item);
    setArchiveObjectId(item.archiveObjectId ?? undefined);
    if (archiveOptions.length) return;
    try {
      const [communities, roads, points] = await Promise.all([
        getApi<{ items: ArchiveOption[] }>("/communities"),
        getApi<{ items: ArchiveOption[] }>("/roads"),
        getApi<{ items: ArchiveOption[] }>("/points"),
      ]);
      setArchiveOptions([
        ...communities.items.map((item) => ({ ...item, objectType: "community" })),
        ...roads.items.map((item) => ({ ...item, objectType: "road" })),
        ...points.items.map((item) => ({ ...item, objectType: "point" })),
      ]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "档案列表加载失败");
    }
  };

  const saveDistribution = async (action: "archive" | "ignore") => {
    if (!distributionItem?.taskPhotoId) return;
    if (action === "archive" && !archiveObjectId) return void message.warning("请选择对象档案");
    setSavingDistribution(true);
    try {
      await patchJsonApi(`/inspection-tasks/${encodeURIComponent(taskId)}/photos/${encodeURIComponent(distributionItem.taskPhotoId)}/distribution`, {
        action,
        ...(action === "archive" ? { archiveObjectId } : {}),
      });
      setDistributionItem(null);
      await loadTask();
      message.success(action === "archive" ? "照片已同步归入对象档案" : "照片已标记为忽略");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "照片分发失败");
    } finally {
      setSavingDistribution(false);
    }
  };

  if (state.error) return <ApiResourceError error={state.error} onRetry={() => void loadTask()} />;
  if (state.loading && !state.task) return <div className="media-task-detail-loading"><Spin size="large" />正在读取任务照片</div>;
  if (!state.task) return null;

  const task = state.task;
  const view = toInspectionTaskViewModel({ ...task, photos: [] });
  const isVideo = task.inputType === "video";
  const videoUrl = isVideo && task.sourceMediaId ? getApiUrl(`/media-assets/${task.sourceMediaId}/content`) : null;

  return (
    <section className="media-library-page video-analysis-page media-task-detail-page">
      <main className="media-workspace">
        <header className="media-task-detail-header">
          <Button icon={<ArrowLeft size={16} />} onClick={() => navigate("/media-library")}>返回任务中心</Button>
          <div><span>巡检任务详情</span><h1>{task.name}</h1></div>
          <Tag className={`media-task-detail-status ${view.statusTone}`}>{view.statusLabel}</Tag>
        </header>

        <section className="media-task-detail-summary" aria-label="任务信息">
          <div><span className="summary-icon blue">{isVideo ? <FileVideo2 size={20} /> : <FileArchive size={20} />}</span><p>输入类型<strong>{view.inputLabel}</strong></p></div>
          <div><span className="summary-icon cyan"><RadioTower size={20} /></span><p>任务来源<strong>{view.sourceLabel}</strong></p></div>
          <div><span className="summary-icon green"><Images size={20} /></span><p>照片池<strong>{task.photoCount} 张</strong></p></div>
          <div><span className="summary-icon purple"><CalendarDays size={20} /></span><p>任务日期<strong>{view.taskDateLabel}</strong></p></div>
          <div className="media-task-detail-progress"><span>处理进度</span><Progress percent={view.progress} status={view.statusLabel === "失败" ? "exception" : undefined} /></div>
        </section>

        {view.errorMessage ? <div className="media-task-detail-error">{view.errorMessage}</div> : null}

        <section className="real-task-detail-actions">
          <div><strong>{task.pendingPhotoCount} 张待分发</strong><span>每张照片只能归入一个小区、街道或重点点位档案</span></div>
          <Button icon={<FileText size={16} />} type="primary" onClick={() => task.report?.id ? navigate("/reports") : navigate(`/reports/write?taskId=${encodeURIComponent(task.id)}`)}>
            {task.report?.id ? "查看综合报告" : "编写综合报告"}
          </Button>
        </section>

        {videoUrl ? <section className="media-task-video-section" aria-label="原始视频">
          <header><div><h2>原始巡检视频</h2><p>视频已按任务设置自动抽帧，原始文件保留用于复核</p></div><span>{view.originalFileName}</span></header>
          <div className="media-task-video-stage"><video controls playsInline preload="metadata" src={videoUrl}>当前浏览器不支持视频播放。</video></div>
        </section> : null}

        <MediaAssetGallery
          items={items}
          loading={state.loading}
          taskStatus={view.statusLabel}
          onWriteReport={(item) => navigate(`/reports/write?taskId=${encodeURIComponent(task.id)}&mediaId=${encodeURIComponent(item.id)}`)}
          onDistribute={(item) => void openDistribution(item)}
        />

        <Modal
          footer={[
            <Button danger key="ignore" loading={savingDistribution} onClick={() => void saveDistribution("ignore")}>标记忽略</Button>,
            <Button key="close" onClick={() => setDistributionItem(null)}>取消</Button>,
            <Button key="archive" loading={savingDistribution} type="primary" onClick={() => void saveDistribution("archive")}>确认归档</Button>,
          ]}
          open={Boolean(distributionItem)}
          title="分发照片到对象档案"
          onCancel={() => setDistributionItem(null)}
        >
          <p className="distribution-modal-hint">一张照片只能关联一个档案；重新选择会替换原关联，不会复制文件。</p>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择小区、街道或重点点位"
            value={archiveObjectId}
            options={archiveOptions.map((item) => ({
              value: item.id,
              label: `${objectTypeLabel(item.objectType)} / ${item.name}`,
            }))}
            onChange={setArchiveObjectId}
          />
        </Modal>
      </main>
    </section>
  );
}

function objectTypeLabel(type: string) {
  if (type === "community") return "小区";
  if (type === "road") return "街道";
  if (type === "point") return "重点点位";
  return "对象";
}
