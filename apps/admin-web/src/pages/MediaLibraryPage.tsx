import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, message, Modal, Select } from "antd";
import {
  AlertTriangle,
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  FileText,
  Film,
  Gauge,
  Grid3X3,
  ListChecks,
  MapPin,
  PlayCircle,
  Plus,
  ScanSearch,
  Settings2,
  Timer,
  Trash2,
  UploadCloud,
  Video,
  Wrench,
  XCircle,
} from "lucide-react";
import { mediaLibraryItems } from "../data";
import "./media-library-detail.css";

type VideoSource = "无人机视频" | "摄像头视频" | "AI眼镜同步" | "人工上传";
type TaskStatus = "待分析" | "分析中" | "待复核" | "已完成" | "失败";
type ReviewStatus = "待复核" | "已确认" | "误报" | "已处置";
type Severity = "一般" | "较重" | "严重";

interface VideoAnalysisTask {
  id: string;
  name: string;
  videoName: string;
  source: VideoSource;
  objectName: string;
  uploadedAt: string;
  duration: string;
  frameIntervalSec: number;
  frameCount: number;
  status: TaskStatus;
  progress: number;
  eventCount: number;
  reportStatus: string;
  thumbnailUrl: string;
  modelName: string;
}

interface IssueEvent {
  id: string;
  taskId: string;
  type: string;
  timeRange: string;
  duration: string;
  confidence: number;
  severity: Severity;
  reviewStatus: ReviewStatus;
  evidenceUrl: string;
  clipName: string;
  linkedObject: string;
  suggestion: string;
  detections: string[];
}

type ReviewCategoryTone = "orange" | "blue" | "green" | "purple";

interface ReviewCategory {
  id: string;
  name: string;
  keywords: string[];
  tone: ReviewCategoryTone;
}

const reviewCategoryStorageKey = "xunjianbao.review-categories";

const defaultReviewCategories: ReviewCategory[] = [
  { id: "engineering-machinery", name: "工程机械", keywords: ["挖掘机", "推土机", "吊车", "工程机械"], tone: "orange" },
  { id: "engineering-vehicles", name: "工程车辆", keywords: ["工程车辆", "施工车辆", "渣土车", "车辆"], tone: "blue" },
  { id: "bare-soil", name: "裸土堆料", keywords: ["裸土", "堆料", "堆放"], tone: "green" },
  { id: "temporary-buildings", name: "临时建筑", keywords: ["临时建筑", "彩钢板", "工棚"], tone: "purple" },
];

function loadReviewCategories() {
  if (typeof window === "undefined") return defaultReviewCategories;
  try {
    const stored = window.localStorage.getItem(reviewCategoryStorageKey);
    const parsed = stored ? JSON.parse(stored) : null;
    if (Array.isArray(parsed) && parsed.every((item) => item?.id && item?.name && Array.isArray(item?.keywords))) {
      return parsed as ReviewCategory[];
    }
  } catch {
    // Keep the built-in categories if local configuration is unavailable.
  }
  return defaultReviewCategories;
}

function reviewCategoryIcon(tone: ReviewCategoryTone) {
  if (tone === "orange") return <Wrench size={16} />;
  if (tone === "green") return <AlertTriangle size={16} />;
  if (tone === "purple") return <Film size={16} />;
  return <Video size={16} />;
}

const thumb = (index: number) => mediaLibraryItems[index]?.thumbnailUrl ?? mediaLibraryItems[0]?.thumbnailUrl ?? "";

const sourceMeta: Record<VideoSource, { icon: JSX.Element; tone: string; desc: string }> = {
  无人机视频: { icon: <Video size={18} />, tone: "blue", desc: "MP4 / MOV 上传" },
  摄像头视频: { icon: <Film size={18} />, tone: "green", desc: "监控录像离线导入" },
  AI眼镜同步: { icon: <ScanSearch size={18} />, tone: "purple", desc: "RTMP / MIO 同步" },
  人工上传: { icon: <UploadCloud size={18} />, tone: "orange", desc: "本地视频补录" },
};

const videoTasks: VideoAnalysisTask[] = [
  {
    id: "vt-quyang-0720",
    name: "曲阳路街道无人机施工巡检",
    videoName: "DJI_20260709_QUYANG_0920.MP4",
    source: "无人机视频",
    objectName: "曲阳路街道 / 曲阳路",
    uploadedAt: "2026-07-09 09:42",
    duration: "18:32",
    frameIntervalSec: 3,
    frameCount: 371,
    status: "待复核",
    progress: 100,
    eventCount: 4,
    reportStatus: "待生成报告",
    thumbnailUrl: thumb(2),
    modelName: "YOLO-Construction-v1",
  },
  {
    id: "vt-chifeng-0708",
    name: "赤峰小区楼顶与周边施工复查",
    videoName: "DJI_20260708_CHIFENG_1530.MOV",
    source: "无人机视频",
    objectName: "赤峰小区",
    uploadedAt: "2026-07-08 15:44",
    duration: "12:05",
    frameIntervalSec: 3,
    frameCount: 242,
    status: "已完成",
    progress: 100,
    eventCount: 2,
    reportStatus: "已生成报告",
    thumbnailUrl: thumb(0),
    modelName: "YOLO-Construction-v1",
  },
  {
    id: "vt-river-0709",
    name: "河道绿化带临时堆料巡检",
    videoName: "DJI_20260709_RIVER_1018.MP4",
    source: "无人机视频",
    objectName: "河道绿化带",
    uploadedAt: "2026-07-09 10:21",
    duration: "09:48",
    frameIntervalSec: 2,
    frameCount: 294,
    status: "分析中",
    progress: 62,
    eventCount: 1,
    reportStatus: "等待复核",
    thumbnailUrl: thumb(4),
    modelName: "YOLO-Construction-v1",
  },
  {
    id: "vt-camera-0709",
    name: "密云路沿街监控施工车辆回放",
    videoName: "CAM_20260709_MIYUN_0815.MP4",
    source: "摄像头视频",
    objectName: "密云路",
    uploadedAt: "2026-07-09 08:38",
    duration: "31:18",
    frameIntervalSec: 5,
    frameCount: 376,
    status: "待分析",
    progress: 8,
    eventCount: 0,
    reportStatus: "未生成",
    thumbnailUrl: thumb(1),
    modelName: "等待分配模型",
  },
];

const issueEvents: IssueEvent[] = [
  {
    id: "evt-001",
    taskId: "vt-quyang-0720",
    type: "疑似工程车辆停放",
    timeRange: "03:20 - 03:45",
    duration: "25 秒",
    confidence: 92,
    severity: "较重",
    reviewStatus: "待复核",
    evidenceUrl: thumb(2),
    clipName: "DJI_20260709_QUYANG_0320_0345.mp4",
    linkedObject: "曲阳路",
    suggestion: "建议人工确认是否为临时施工车辆占道，确认后推送道路街面档案与问题台账。",
    detections: ["工程车辆", "施工围挡", "道路占用"],
  },
  {
    id: "evt-002",
    taskId: "vt-quyang-0720",
    type: "裸土与堆料",
    timeRange: "06:12 - 06:39",
    duration: "27 秒",
    confidence: 88,
    severity: "一般",
    reviewStatus: "待复核",
    evidenceUrl: thumb(5),
    clipName: "DJI_20260709_QUYANG_0612_0639.mp4",
    linkedObject: "曲阳路",
    suggestion: "建议复核裸土是否覆盖、堆料是否占用公共通道。",
    detections: ["裸土", "建筑堆料"],
  },
  {
    id: "evt-003",
    taskId: "vt-quyang-0720",
    type: "施工区域疑似扩张",
    timeRange: "11:02 - 11:30",
    duration: "28 秒",
    confidence: 84,
    severity: "严重",
    reviewStatus: "已确认",
    evidenceUrl: thumb(3),
    clipName: "DJI_20260709_QUYANG_1102_1130.mp4",
    linkedObject: "曲阳路",
    suggestion: "已确认，建议生成问题记录并纳入本次巡检报告。",
    detections: ["施工区域", "工程机械", "临时围挡"],
  },
  {
    id: "evt-004",
    taskId: "vt-chifeng-0708",
    type: "楼顶疑似临时搭建",
    timeRange: "02:18 - 02:36",
    duration: "18 秒",
    confidence: 79,
    severity: "较重",
    reviewStatus: "已处置",
    evidenceUrl: thumb(0),
    clipName: "DJI_20260708_CHIFENG_0218_0236.mp4",
    linkedObject: "赤峰小区",
    suggestion: "已完成处置复核，保留报告证据链。",
    detections: ["临时建筑", "楼顶堆物"],
  },
  {
    id: "evt-005",
    taskId: "vt-river-0709",
    type: "河道边疑似堆料",
    timeRange: "04:05 - 04:17",
    duration: "12 秒",
    confidence: 73,
    severity: "一般",
    reviewStatus: "待复核",
    evidenceUrl: thumb(4),
    clipName: "DJI_20260709_RIVER_0405_0417.mp4",
    linkedObject: "河道绿化带",
    suggestion: "任务仍在分析中，建议待全量事件合并后统一复核。",
    detections: ["堆料", "河道边界"],
  },
];

function taskStatusClass(status: TaskStatus) {
  if (status === "分析中") return "processing";
  if (status === "待复核") return "review";
  if (status === "已完成") return "done";
  if (status === "失败") return "failed";
  return "waiting";
}

function reviewStatusClass(status: ReviewStatus) {
  if (status === "已确认") return "confirmed";
  if (status === "误报") return "false-positive";
  if (status === "已处置") return "closed";
  return "review";
}

function severityClass(severity: Severity) {
  if (severity === "严重") return "high";
  if (severity === "较重") return "medium";
  return "normal";
}

export function MediaLibraryPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [source, setSource] = useState<VideoSource | "全部来源">("全部来源");
  const [taskStatus, setTaskStatus] = useState<TaskStatus | "全部状态">("全部状态");
  const [selectedTaskId, setSelectedTaskId] = useState(videoTasks[0].id);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [reviewCategories, setReviewCategories] = useState<ReviewCategory[]>(loadReviewCategories);
  const [selectedReviewCategoryId, setSelectedReviewCategoryId] = useState("all");
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [categoryDrafts, setCategoryDrafts] = useState<ReviewCategory[]>([]);

  const filteredTasks = useMemo(() => videoTasks.filter((item) => {
    const keywordMatched = !keyword || `${item.name}${item.videoName}${item.objectName}${item.source}`.includes(keyword);
    const sourceMatched = source === "全部来源" || item.source === source;
    const statusMatched = taskStatus === "全部状态" || item.status === taskStatus;
    return keywordMatched && sourceMatched && statusMatched;
  }), [keyword, source, taskStatus]);

  const selectedTask = videoTasks.find((item) => item.id === selectedTaskId) ?? videoTasks[0];
  const taskReviewEvents = issueEvents.filter((item) => item.taskId === selectedTask.id);
  const selectedReviewCategory = reviewCategories.find((item) => item.id === selectedReviewCategoryId);
  const selectedTaskEvents = taskReviewEvents.filter((item) => {
    if (!selectedReviewCategory) return true;
    const searchableText = `${item.type} ${item.detections.join(" ")}`;
    return selectedReviewCategory.keywords.some((keyword) => searchableText.includes(keyword));
  });
  const selectedEvent = selectedEventId
    ? issueEvents.find((item) => item.id === selectedEventId) ?? null
    : null;

  const pendingReviewCount = issueEvents.filter((item) => item.reviewStatus === "待复核").length;
  const completedReportCount = videoTasks.filter((item) => item.reportStatus === "已生成报告").length;

  const selectTask = (id: string) => {
    setSelectedTaskId(id);
    setSelectedEventId(null);
  };

  const openCategoryManager = () => {
    setCategoryDrafts(reviewCategories.map((item) => ({ ...item, keywords: [...item.keywords] })));
    setIsCategoryManagerOpen(true);
  };

  const updateCategoryDraft = (id: string, field: "name" | "keywords", value: string) => {
    setCategoryDrafts((items) => items.map((item) => {
      if (item.id !== id) return item;
      return field === "name"
        ? { ...item, name: value }
        : { ...item, keywords: value.split(/[、,，]/).map((keyword) => keyword.trim()).filter(Boolean) };
    }));
  };

  const addCategoryDraft = () => {
    const nextIndex = categoryDrafts.length + 1;
    const tones: ReviewCategoryTone[] = ["blue", "green", "orange", "purple"];
    setCategoryDrafts((items) => [
      ...items,
      { id: `custom-${Date.now()}`, name: `识别维度 ${nextIndex}`, keywords: [], tone: tones[items.length % tones.length] },
    ]);
  };

  const saveReviewCategories = () => {
    const normalized = categoryDrafts
      .map((item) => ({ ...item, name: item.name.trim(), keywords: item.keywords.map((keyword) => keyword.trim()).filter(Boolean) }))
      .filter((item) => item.name);
    if (!normalized.length) {
      message.error("请至少保留一个算法识别维度");
      return;
    }
    if (new Set(normalized.map((item) => item.name)).size !== normalized.length) {
      message.error("识别维度名称不能重复");
      return;
    }
    setReviewCategories(normalized);
    window.localStorage.setItem(reviewCategoryStorageKey, JSON.stringify(normalized));
    if (selectedReviewCategoryId !== "all" && !normalized.some((item) => item.id === selectedReviewCategoryId)) {
      setSelectedReviewCategoryId("all");
    }
    setIsCategoryManagerOpen(false);
    message.success("算法识别维度已保存");
  };

  const createAnalysisTask = () => {
    message.success("已创建视频分析任务：默认每 3 秒抽 1 帧，后台离线识别后合并疑似事件");
  };

  const uploadVideo = () => {
    message.info("视频上传入口已预留：支持 MP4 / MOV，上传后自动创建后台分析任务");
  };

  const confirmEvent = () => {
    if (!selectedEvent) return;
    message.success(`已确认“${selectedEvent.type}”，将同步进入问题台账和对应对象档案`);
  };

  return (
    <section className="media-library-page video-analysis-page">
      <main className="media-workspace">
        <header className="media-topbar video-analysis-topbar">
          <div>
            <h1>视频巡检分析中心</h1>
          </div>
          <div className="media-top-actions">
            <Bell size={18} />
            <span className="media-notice">12</span>
            <strong>曲阳路街道</strong>
            <ChevronDown size={16} />
          </div>
        </header>

        <section className="media-filter-strip video-filter-strip">
          <Input
            allowClear
            prefix={<ScanSearch size={16} />}
            placeholder="搜索视频名称、任务、小区、街道、问题类型"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <button type="button"><CalendarDays size={16} />上传日期</button>
          <Select
            value={source}
            onChange={setSource}
            options={[
              { label: "全部来源", value: "全部来源" },
              { label: "无人机视频", value: "无人机视频" },
              { label: "摄像头视频", value: "摄像头视频" },
              { label: "AI眼镜同步", value: "AI眼镜同步" },
              { label: "人工上传", value: "人工上传" },
            ]}
          />
          <Select
            value={taskStatus}
            onChange={setTaskStatus}
            options={[
              { label: "全部状态", value: "全部状态" },
              { label: "待分析", value: "待分析" },
              { label: "分析中", value: "分析中" },
              { label: "待复核", value: "待复核" },
              { label: "已完成", value: "已完成" },
              { label: "失败", value: "失败" },
            ]}
          />
          <Button type="primary" icon={<UploadCloud size={16} />} onClick={uploadVideo}>上传视频</Button>
          <Button type="primary" icon={<Bot size={16} />} onClick={createAnalysisTask}>创建分析任务</Button>
          <Button icon={<FileText size={16} />} onClick={() => navigate("/reports/write")}>生成报告</Button>
        </section>

        <section className="media-stat-grid video-stat-grid">
          <article>
            <span className="stat-icon blue"><Video size={24} /></span>
            <div><em>视频任务数</em><strong>{videoTasks.length}</strong><p>MP4 / MOV 离线分析</p></div>
          </article>
          <article>
            <span className="stat-icon orange"><Gauge size={24} /></span>
            <div><em>正在分析</em><strong>{videoTasks.filter((item) => item.status === "分析中").length}</strong><p>后台抽帧识别中</p></div>
          </article>
          <article>
            <span className="stat-icon green"><AlertTriangle size={24} /></span>
            <div><em>待复核事件</em><strong>{pendingReviewCount}</strong><p>AI 疑似问题待确认</p></div>
          </article>
          <article>
            <span className="stat-icon purple"><FileText size={24} /></span>
            <div><em>已生成报告</em><strong>{completedReportCount}</strong><p>确认后纳入巡检报告</p></div>
          </article>
        </section>

        <div className="media-main-grid video-main-grid">
          <section className="media-gallery-panel video-workspace-panel">
            <div className="video-workspace-header">
              <div className="video-review-strip">
                <strong>待复核类型</strong>
                <div className="video-review-filters" role="group" aria-label="算法识别维度筛选">
                  <button
                    className={`video-review-filter ${selectedReviewCategoryId === "all" ? "active" : ""}`}
                    type="button"
                    onClick={() => setSelectedReviewCategoryId("all")}
                  >
                    全部 <em>{taskReviewEvents.length}</em>
                  </button>
                  {reviewCategories.map((item) => {
                    const categoryCount = taskReviewEvents.filter((event) => {
                      const searchableText = `${event.type} ${event.detections.join(" ")}`;
                      return item.keywords.some((keyword) => searchableText.includes(keyword));
                    }).length;
                    return (
                      <button
                        className={`video-review-filter ${selectedReviewCategoryId === item.id ? "active" : ""}`}
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedReviewCategoryId(item.id)}
                      >
                        <span className={`source-icon ${item.tone}`}>{reviewCategoryIcon(item.tone)}</span>
                        <b>{item.name}</b>
                        <em>{categoryCount}</em>
                      </button>
                    );
                  })}
                </div>
                <button className="video-review-manage" type="button" onClick={openCategoryManager}>
                  <Settings2 size={16} /> 管理分类
                </button>
                <button className="video-review-ledger" type="button" onClick={() => navigate("/issues")}>问题台账</button>
              </div>

              <div className="media-gallery-toolbar video-task-toolbar">
                <strong>视频任务</strong>
                <span>已筛选 {filteredTasks.length} 个任务</span>
                <button type="button" onClick={createAnalysisTask}>重新分析</button>
                <button type="button" onClick={() => message.info("批量复核入口已预留")}>批量复核</button>
                <div>
                  <span>排序：上传时间 ↓</span>
                  <Grid3X3 size={18} />
                  <ListChecks size={18} />
                </div>
              </div>
            </div>

            <div className="video-workspace-split">
              <section className="video-task-panel">
              <div className="video-task-list">
                {filteredTasks.map((item) => (
                  <button
                    className={`video-task-card ${selectedTask.id === item.id ? "active" : ""}`}
                    key={item.id}
                    type="button"
                    onClick={() => selectTask(item.id)}
                  >
                    <div className="video-task-thumb">
                      <img src={item.thumbnailUrl} alt={item.name} />
                      <span className={`source-pill ${sourceMeta[item.source].tone}`}>{item.source}</span>
                      <span className={`analysis-status ${taskStatusClass(item.status)}`}>{item.status}</span>
                      <i><PlayCircle size={22} /></i>
                    </div>
                    <div className="video-task-body">
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.videoName}</span>
                      </div>
                      <p><MapPin size={14} />{item.objectName}</p>
                      <div className="video-task-meta">
                        <span><Timer size={14} />{item.duration}</span>
                        <span>每 {item.frameIntervalSec} 秒抽 1 帧</span>
                        <span>{item.frameCount} 帧</span>
                        <span>{item.eventCount} 个事件</span>
                      </div>
                      <div className="task-progress"><i style={{ width: `${item.progress}%` }} /></div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

              <section className="event-section video-event-panel">
              <div className="event-section-head">
                <div>
                  <h3>疑似问题事件</h3>
                  <p>{selectedReviewCategory ? `当前筛选：${selectedReviewCategory.name}` : "当前任务的 AI 疑似问题"}</p>
                </div>
                <span>{selectedTaskEvents.length} 个事件</span>
              </div>
              <div className="event-card-grid">
                {selectedTaskEvents.length ? selectedTaskEvents.map((item) => (
                  <button
                    className={`issue-event-card ${selectedEvent?.id === item.id ? "active" : ""}`}
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedEventId(item.id)}
                  >
                    <div className="event-evidence">
                      <img src={item.evidenceUrl} alt={item.type} />
                      <span className="event-time">{item.timeRange}</span>
                      <span className={`severity-pill ${severityClass(item.severity)}`}>{item.severity}</span>
                      <i className="detection-box box-a" />
                      <i className="detection-box box-b" />
                    </div>
                    <div className="event-card-body">
                      <strong>{item.type}</strong>
                      <p>{item.linkedObject} / {item.clipName}</p>
                      <footer>
                        <span><Gauge size={14} />{item.confidence}%</span>
                        <em className={`review-status ${reviewStatusClass(item.reviewStatus)}`}>{item.reviewStatus}</em>
                      </footer>
                    </div>
                  </button>
                )) : <div className="event-empty-state">当前筛选条件下暂无疑似问题事件</div>}
              </div>
            </section>
            </div>
          </section>

          {selectedEvent ? <div className="event-detail-layer" role="presentation" onClick={() => setSelectedEventId(null)}>
            <aside className="media-detail-panel video-event-detail" role="dialog" aria-modal="true" aria-label="疑似事件详情" onClick={(event) => event.stopPropagation()}>
            <div className="media-panel-head detail">
              <h3>疑似事件详情</h3>
              <button aria-label="关闭事件详情" type="button" onClick={() => setSelectedEventId(null)}>×</button>
            </div>
            <div className="media-detail-evidence">
              <img src={selectedEvent.evidenceUrl} alt={selectedEvent.type} />
              <span className={`severity-pill ${severityClass(selectedEvent.severity)}`}>{selectedEvent.severity}</span>
              <i className="detection-box detail-a" />
              <i className="detection-box detail-b" />
            </div>
            <dl className="media-detail-list">
              <div><dt>问题类型</dt><dd>{selectedEvent.type}</dd></div>
              <div><dt>视频时间点</dt><dd>{selectedEvent.timeRange}</dd></div>
              <div><dt>持续时间</dt><dd>{selectedEvent.duration}</dd></div>
              <div><dt>AI置信度</dt><dd>{selectedEvent.confidence}%</dd></div>
              <div><dt>复核状态</dt><dd><span className={`review-status ${reviewStatusClass(selectedEvent.reviewStatus)}`}>{selectedEvent.reviewStatus}</span></dd></div>
              <div><dt>所属对象</dt><dd className="link-like">{selectedEvent.linkedObject}</dd></div>
              <div><dt>关联片段</dt><dd>{selectedEvent.clipName}</dd></div>
              <div><dt>分析模型</dt><dd>{selectedTask.modelName}</dd></div>
            </dl>
            <div className="event-detection-list">
              <strong>识别结果</strong>
              <div>
                {selectedEvent.detections.map((item) => <span key={item}>{item}</span>)}
              </div>
              <p>{selectedEvent.suggestion}</p>
            </div>
            <Button type="primary" block icon={<CheckCircle2 size={16} />} onClick={confirmEvent}>确认为问题并进入台账</Button>
            <div className="media-detail-actions">
              <Button block icon={<XCircle size={16} />} onClick={() => message.warning("已标记为误报，不进入正式报告")}>标记误报</Button>
              <Button block icon={<FileText size={16} />} onClick={() => navigate("/reports/write")}>加入报告</Button>
            </div>
            <button className="media-more-action" type="button" onClick={() => message.info(`打开视频片段：${selectedEvent.clipName}`)}>
              查看原始视频片段 <ChevronDown size={14} />
            </button>
            </aside>
          </div> : null}
        </div>

        <Modal
          cancelText="取消"
          className="review-category-modal"
          okText="保存维度"
          onCancel={() => setIsCategoryManagerOpen(false)}
          onOk={saveReviewCategories}
          open={isCategoryManagerOpen}
          title="算法识别维度"
        >
          <p className="review-category-hint">名称用于筛选和报告归类；关键词用于匹配 AI 识别结果，可按实际模型能力维护。</p>
          <div className="review-category-editor">
            {categoryDrafts.map((item) => (
              <article key={item.id}>
                <Input
                  aria-label={`${item.name}名称`}
                  placeholder="识别维度名称"
                  value={item.name}
                  onChange={(event) => updateCategoryDraft(item.id, "name", event.target.value)}
                />
                <Input
                  aria-label={`${item.name}关键词`}
                  placeholder="关键词，使用顿号或逗号分隔"
                  value={item.keywords.join("、")}
                  onChange={(event) => updateCategoryDraft(item.id, "keywords", event.target.value)}
                />
                <Button
                  aria-label={`删除${item.name}`}
                  danger
                  icon={<Trash2 size={16} />}
                  type="text"
                  onClick={() => setCategoryDrafts((items) => items.filter((draft) => draft.id !== item.id))}
                />
              </article>
            ))}
          </div>
          <Button block icon={<Plus size={16} />} type="dashed" onClick={addCategoryDraft}>新增识别维度</Button>
        </Modal>
      </main>
    </section>
  );
}
