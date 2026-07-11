import { useCallback, useEffect, useState } from "react";
import { Button, Progress, Spin, Tag } from "antd";
import { ArrowLeft, Clock3, FileArchive, FileVideo2, HardDrive, Images } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { getApi, getApiUrl } from "../api/client";
import { ApiResourceError } from "../components/ApiResourceError";
import { MediaAssetGallery } from "../components/MediaAssetGallery";
import { toMediaGalleryItem, type MediaChildAssetRecord, type MediaGalleryItem } from "../components/media-asset-presenter";
import type { MediaTaskRecord } from "./media-task-adapter";
import { toMediaTaskDetail, type MediaTaskDetail } from "./media-task-detail-presenter";
import "./media-library-detail.css";

interface DetailState {
  task: MediaTaskDetail | null;
  items: MediaGalleryItem[];
  loading: boolean;
  error: Error | null;
}

const initialState: DetailState = { task: null, items: [], loading: true, error: null };

export function MediaTaskDetailPage() {
  const { taskId = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<DetailState>(initialState);

  const loadTask = useCallback((signal?: AbortSignal) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    return Promise.all([
      getApi<MediaTaskRecord>(`/media-assets/${encodeURIComponent(taskId)}`, signal),
      getApi<MediaChildAssetRecord[]>(`/media-assets/${encodeURIComponent(taskId)}/children`, signal),
    ]).then(([record, children]) => {
      setState({
        task: toMediaTaskDetail(record, getApiUrl),
        items: children.map((item) => toMediaGalleryItem(item, getApiUrl(`/media-assets/${item.id}/content`))),
        loading: false,
        error: null,
      });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error : new Error("媒体任务加载失败"),
      }));
    });
  }, [taskId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadTask(controller.signal);
    return () => controller.abort();
  }, [loadTask]);

  useEffect(() => {
    if (!state.task || !new Set(["待分析", "分析中"]).has(state.task.status)) return;
    const timer = window.setInterval(() => void loadTask(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadTask, state.task]);

  if (state.error) return <ApiResourceError error={state.error} onRetry={() => void loadTask()} />;
  if (state.loading && !state.task) return <div className="media-task-detail-loading"><Spin size="large" />正在读取任务素材</div>;
  if (!state.task) return null;

  const task = state.task;

  return (
    <section className="media-library-page video-analysis-page media-task-detail-page">
      <main className="media-workspace">
        <header className="media-task-detail-header">
          <Button icon={<ArrowLeft size={16} />} onClick={() => navigate("/media-library")}>返回媒体库</Button>
          <div>
            <span>媒体任务详情</span>
            <h1>{task.originalFileName}</h1>
          </div>
          <Tag className={`media-task-detail-status ${task.status === "已完成" ? "done" : task.status === "失败" ? "failed" : "processing"}`}>
            {task.status}
          </Tag>
        </header>

        <section className="media-task-detail-summary" aria-label="任务信息">
          <div><span className="summary-icon blue">{task.assetKind === "video" ? <FileVideo2 size={20} /> : <FileArchive size={20} />}</span><p>素材类型<strong>{task.kindLabel}</strong></p></div>
          <div><span className="summary-icon cyan"><Clock3 size={20} /></span><p>处理方式<strong>{task.intervalLabel}</strong></p></div>
          <div><span className="summary-icon green"><Images size={20} /></span><p>素材数量<strong>{task.assetCountLabel}</strong></p></div>
          <div><span className="summary-icon purple"><HardDrive size={20} /></span><p>文件大小<strong>{task.fileSizeLabel}</strong></p></div>
          <div className="media-task-detail-progress"><span>处理进度</span><Progress percent={task.progress} status={task.status === "失败" ? "exception" : undefined} /></div>
        </section>

        {task.errorMessage ? <div className="media-task-detail-error">{task.errorMessage}</div> : null}

        {task.videoUrl ? <section className="media-task-video-section" aria-label="原始视频">
          <header>
            <div><h2>原始巡检视频</h2><p>可播放、暂停或拖动时间轴查看原始素材</p></div>
            <span>{task.createdAtLabel}</span>
          </header>
          <div className="media-task-video-stage">
            <video controls playsInline preload="metadata" src={task.videoUrl}>
              当前浏览器不支持视频播放。
            </video>
          </div>
        </section> : null}

        <MediaAssetGallery
          items={state.items}
          loading={state.loading}
          taskStatus={task.status}
          onWriteReport={(item) => navigate(`/reports/write?mediaId=${encodeURIComponent(item.id)}`)}
        />
      </main>
    </section>
  );
}
