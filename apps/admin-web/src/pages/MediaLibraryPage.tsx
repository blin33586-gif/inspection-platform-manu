import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, DatePicker, Empty, Input, message, Modal, Pagination, Select, Spin } from "antd";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  FileArchive,
  FileImage,
  FileText,
  Gauge,
  Images,
  ListChecks,
  ScanSearch,
  Trash2,
  Timer,
  UploadCloud,
  Video,
} from "lucide-react";
import { deleteJsonApi, getApi, getApiUrl, postFormApi, postJsonApi, withQuery } from "../api/client";
import { MediaTaskPreview } from "../components/MediaTaskPreview";
import {
  toInspectionTaskViewModel,
  type InspectionTaskRecord,
} from "./inspection-task-presenter";
import { describeTaskPurgeImpact } from "./inspection-task-delete-presenter";
import { getCurrentProject, getUser } from "../auth/session";
import { canModifyProject } from "../auth/project-access";
import "./media-library-detail.css";

type TaskSource = "manual" | "drone" | "camera" | "glasses";
type TaskInput = "video" | "archive" | "images";

interface TaskListResult {
  items: InspectionTaskRecord[];
  page: number;
  pageSize: number;
  total: number;
  stats: {
    taskCount: number;
    processingTaskCount: number;
    pendingPhotoCount: number;
    generatedReportCount: number;
  };
}

const emptyTaskList: TaskListResult = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
  stats: { taskCount: 0, processingTaskCount: 0, pendingPhotoCount: 0, generatedReportCount: 0 },
};

const sourceOptions = [
  { label: "人工上传", value: "manual" },
  { label: "无人机", value: "drone" },
  { label: "摄像头", value: "camera" },
  { label: "智能眼镜", value: "glasses" },
];

const statusOptions = [
  { label: "全部状态", value: "" },
  { label: "排队中", value: "queued" },
  { label: "处理中", value: "running" },
  { label: "待分发", value: "ready_for_distribution" },
  { label: "已完成", value: "completed" },
  { label: "失败", value: "failed" },
];

const inputOptions = [
  { label: "巡检视频", value: "video" },
  { label: "ZIP 图片包", value: "archive" },
  { label: "直接上传图片", value: "images" },
];

const acceptByInput: Record<TaskInput, string> = {
  video: ".mp4,.mov,video/mp4,video/quicktime",
  archive: ".zip,application/zip",
  images: ".jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.tif,.tiff,.heic,.heif,image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/heif",
};

export function MediaLibraryPage() {
  const navigate = useNavigate();
  const project = getCurrentProject();
  const canModify = canModifyProject(getUser()?.role);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [keyword, setKeyword] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [processStatus, setProcessStatus] = useState("");
  const [uploadRange, setUploadRange] = useState<[string, string] | null>(null);
  const [page, setPage] = useState(1);
  const [taskList, setTaskList] = useState<TaskListResult>(emptyTaskList);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [taskDate, setTaskDate] = useState(today());
  const [taskSource, setTaskSource] = useState<TaskSource>("manual");
  const [taskInput, setTaskInput] = useState<TaskInput>("video");
  const [intervalSeconds, setIntervalSeconds] = useState(3);
  const [files, setFiles] = useState<File[]>([]);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const loadTasks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await getApi<TaskListResult>(withQuery("/inspection-tasks", {
        keyword: keyword.trim() || undefined,
        sourceType: sourceType || undefined,
        processStatus: processStatus || undefined,
        uploadStart: uploadRange?.[0],
        uploadEnd: uploadRange?.[1],
        page,
        pageSize: 20,
      }));
      setTaskList(result);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [keyword, sourceType, processStatus, uploadRange, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTasks().catch(showLoadError), 220);
    return () => window.clearTimeout(timer);
  }, [loadTasks]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadTasks(true).catch(() => undefined), 5_000);
    return () => window.clearInterval(timer);
  }, [loadTasks]);

  const tasks = useMemo(() => taskList.items.map(toInspectionTaskViewModel), [taskList.items]);

  const resetCreateForm = (input: TaskInput = "video") => {
    setTaskName("");
    setTaskDate(today());
    setTaskSource("manual");
    setTaskInput(input);
    setIntervalSeconds(3);
    setFiles([]);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const chooseFiles = (nextFiles: FileList | null) => {
    const selected = Array.from(nextFiles ?? []);
    setFiles(selected);
    if (!taskName && selected[0]) setTaskName(stripExtension(selected[0].name));
  };

  const createTask = async () => {
    if (!taskName.trim()) return void message.warning("请输入任务名称");
    if (!taskDate) return void message.warning("请选择任务日期");
    if (!files.length) return void message.warning("请选择任务素材");

    const formData = new FormData();
    formData.append("name", taskName.trim());
    formData.append("taskDate", taskDate);
    formData.append("sourceType", taskSource);
    formData.append("inputType", taskInput);
    if (taskInput === "video") formData.append("intervalSeconds", String(intervalSeconds));
    files.forEach((file) => formData.append("files", file));

    setCreating(true);
    try {
      const task = await postFormApi<InspectionTaskRecord>("/inspection-tasks", formData);
      message.success(taskInput === "video" ? "任务已创建，视频正在后台抽帧" : taskInput === "archive" ? "任务已创建，图片包正在后台解压" : "图片任务已创建");
      setCreateOpen(false);
      await loadTasks(true);
      navigate(`/media-library/${encodeURIComponent(task.id)}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "任务创建失败");
    } finally {
      setCreating(false);
    }
  };

  const retryTask = async (jobId: string | null) => {
    if (!jobId) return;
    try {
      await postJsonApi(`/media-jobs/${jobId}/retry`, {});
      await loadTasks(true);
      message.success("任务已重新进入后台队列");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "重新处理失败");
    }
  };

  const confirmDeleteTask = (task: ReturnType<typeof toInspectionTaskViewModel>) => {
    Modal.confirm({
      title: "彻底删除任务",
      content: describeTaskPurgeImpact(task),
      okText: "彻底删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      async onOk() {
        setDeletingTaskId(task.id);
        try {
          await deleteJsonApi(`/inspection-tasks/${encodeURIComponent(task.id)}`);
          message.success("任务已彻底删除");
          if (tasks.length === 1 && page > 1) setPage(page - 1);
          else await loadTasks(true);
        } catch (error) {
          message.error(error instanceof Error ? error.message : "任务删除失败");
          throw error;
        } finally {
          setDeletingTaskId(null);
        }
      },
    });
  };

  return (
    <section className="media-library-page video-analysis-page real-task-center-page">
      <main className="media-workspace">
        <header className="media-topbar video-analysis-topbar">
          <div><h1>巡检任务中心</h1></div>
          <div className="media-top-actions">
            <Bell size={18} />
            <span className="media-notice">12</span>
            <strong>{project?.shortName ?? "当前项目"}</strong>
            <ChevronDown size={16} />
          </div>
        </header>

        <section className="media-filter-strip video-filter-strip real-task-filter-strip">
          <Input
            allowClear
            prefix={<ScanSearch size={16} />}
            placeholder="搜索任务名称或原始文件名"
            value={keyword}
            onChange={(event) => { setKeyword(event.target.value); setPage(1); }}
          />
          <DatePicker.RangePicker
            allowClear
            aria-label="上传日期"
            placeholder={["上传开始日期", "上传结束日期"]}
            onChange={(_, dateStrings) => {
              setUploadRange(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : null);
              setPage(1);
            }}
          />
          <Select
            aria-label="任务来源"
            value={sourceType}
            onChange={(value) => { setSourceType(value); setPage(1); }}
            options={[{ label: "全部来源", value: "" }, ...sourceOptions]}
          />
          <Select
            aria-label="处理状态"
            value={processStatus}
            onChange={(value) => { setProcessStatus(value); setPage(1); }}
            options={statusOptions}
          />
          {canModify ? <Button type="primary" icon={<UploadCloud size={16} />} onClick={openCreate}>新建任务</Button> : null}
          <Button icon={<FileText size={16} />} onClick={() => navigate("/reports")}>巡检报告</Button>
        </section>

        <section className="media-stat-grid video-stat-grid real-task-stat-grid">
          <article><span className="stat-icon blue"><Video size={22} /></span><div><em>任务数</em><strong>{taskList.stats.taskCount}</strong><p>视频、图片包与图片统一管理</p></div></article>
          <article><span className="stat-icon orange"><Gauge size={22} /></span><div><em>正在处理</em><strong>{taskList.stats.processingTaskCount}</strong><p>后台抽帧或解压处理中</p></div></article>
          <article><span className="stat-icon green"><Images size={22} /></span><div><em>待分发照片</em><strong>{taskList.stats.pendingPhotoCount}</strong><p>等待归入唯一对象档案</p></div></article>
          <article><span className="stat-icon purple"><FileText size={22} /></span><div><em>综合报告</em><strong>{taskList.stats.generatedReportCount}</strong><p>每个任务最多一份综合报告</p></div></article>
        </section>

        <section className="media-gallery-panel video-workspace-panel real-task-list-panel">
          <div className="media-gallery-toolbar video-task-toolbar">
            <strong>任务</strong>
            <span>共 {taskList.total} 个真实任务</span>
            <div><span>按上传时间排序</span><ListChecks size={18} /></div>
          </div>

          {loading ? <div className="real-task-loading"><Spin />正在读取任务</div> : null}
          {!loading && !tasks.length ? <Empty description="当前条件下暂无任务" /> : null}
          {!loading && tasks.length ? <div className="video-task-list real-task-list">
            {tasks.map((task) => {
              const isVideo = task.inputLabel === "视频";
              const posterUrl = task.posterAssetId ? getApiUrl(`/media-assets/${task.posterAssetId}/content`) : "";
              const videoUrl = isVideo && task.sourceMediaId ? getApiUrl(`/media-assets/${task.sourceMediaId}/content`) : undefined;
              return (
                <article
                  className="video-task-card real-task-card"
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/media-library/${encodeURIComponent(task.id)}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") navigate(`/media-library/${encodeURIComponent(task.id)}`);
                  }}
                >
                  <div className="video-task-thumb">
                    {posterUrl || videoUrl ? <MediaTaskPreview
                      assetKind={isVideo ? "video" : "image_bundle"}
                      alt={task.name}
                      posterUrl={posterUrl}
                      videoUrl={videoUrl}
                    /> : <div className="real-task-placeholder">{task.inputLabel === "ZIP 图片包" ? <FileArchive size={38} /> : <FileImage size={38} />}<span>素材处理中</span></div>}
                    <span className={`source-pill ${task.sourceTone}`}>{task.sourceLabel}</span>
                    <span className={`analysis-status ${task.statusTone}`}>{task.statusLabel}</span>
                  </div>
                  <div className="video-task-body">
                    <div className="real-task-title-row">
                      <div><strong>{task.name}</strong><span>{task.originalFileName}</span></div>
                      {canModify ? <button
                        aria-label={`删除任务 ${task.name}`}
                        className="real-task-delete-button"
                        disabled={deletingTaskId === task.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          confirmDeleteTask(task);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Trash2 size={17} />
                      </button> : null}
                    </div>
                    <p><CalendarDays size={14} />任务日期 {task.taskDateLabel} · 上传 {task.createdAtLabel}</p>
                    <div className="video-task-meta">
                      <span>{task.inputLabel}</span>
                      <span>{task.photoCount} 张照片</span>
                      <span>{task.pendingPhotoCount} 张待分发</span>
                      <span>{task.reportId ? "已生成综合报告" : "综合报告未生成"}</span>
                    </div>
                    <div className="task-progress"><i style={{ width: `${task.progress}%` }} /></div>
                    {canModify && task.statusLabel === "失败" ? <div className="video-task-error">
                      <span>{task.errorMessage || "任务处理失败"}</span>
                      <button type="button" onClick={(event) => { event.stopPropagation(); void retryTask(task.jobId); }}>重新处理</button>
                    </div> : null}
                  </div>
                </article>
              );
            })}
          </div> : null}

          {taskList.total > taskList.pageSize ? <Pagination
            current={taskList.page}
            pageSize={taskList.pageSize}
            showSizeChanger={false}
            total={taskList.total}
            onChange={setPage}
          /> : null}
        </section>

        <Modal
          cancelText="取消"
          okButtonProps={{ loading: creating }}
          okText="创建任务"
          open={createOpen}
          title="新建巡检任务"
          width={640}
          onCancel={() => setCreateOpen(false)}
          onOk={() => void createTask()}
        >
          <div className="real-task-create-form">
            <label><span>任务名称</span><Input value={taskName} placeholder={`例如：7月11日${project?.shortName ?? "项目"}巡检`} onChange={(event) => setTaskName(event.target.value)} /></label>
            <div>
              <label><span>任务日期</span><Input type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} /></label>
              <label><span>任务来源</span><Select value={taskSource} options={sourceOptions} onChange={setTaskSource} /></label>
            </div>
            <label><span>素材类型</span><Select value={taskInput} options={inputOptions} onChange={(value) => {
              setTaskInput(value);
              setFiles([]);
              if (uploadInputRef.current) uploadInputRef.current.value = "";
            }} /></label>
            {taskInput === "video" ? <label><span>抽帧间隔</span><Select value={intervalSeconds} options={[1, 2, 3, 4, 5].map((value) => ({ label: `${value} 秒/帧`, value }))} onChange={setIntervalSeconds} /></label> : null}
            <input
              ref={uploadInputRef}
              accept={acceptByInput[taskInput]}
              className="video-file-input"
              multiple={taskInput === "images"}
              type="file"
              onChange={(event) => chooseFiles(event.target.files)}
            />
            <button className="real-task-file-picker" type="button" onClick={() => uploadInputRef.current?.click()}>
              <UploadCloud size={24} />
              <strong>{files.length ? `已选择 ${files.length} 个文件` : taskInput === "images" ? "选择一张或多张图片" : taskInput === "archive" ? "选择一个 ZIP 图片包" : "选择一个 MP4 或 MOV 视频"}</strong>
              <span>{files.length ? files.map((file) => file.name).join("、") : "任务创建后自动进入对应处理流程"}</span>
            </button>
          </div>
        </Modal>
      </main>
    </section>
  );
}

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

function showLoadError(error: unknown) {
  message.error(error instanceof Error ? error.message : "任务加载失败");
}
