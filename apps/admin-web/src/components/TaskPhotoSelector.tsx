import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Empty, Modal, Pagination, Segmented, Spin, Tag } from "antd";
import { CheckCheck, Images, RotateCcw } from "lucide-react";
import { getApi, getApiUrl } from "../api/client";
import type { ReportMediaAssetRecord } from "../pages/report-media-adapter";
import {
  defaultTaskPhotoSelection,
  filterTaskPhotos,
  setTaskPhotoSelected,
  type TaskPhotoStatusFilter,
} from "../pages/task-photo-selection";

export interface SelectableTaskPhoto {
  id: string;
  distributionStatus: string;
  archiveObjectId: string | null;
  videoTimestampMs: number | null;
  mediaAsset: ReportMediaAssetRecord;
  archiveObject: { id: string; name: string; objectType: string } | null;
}

interface TaskPhotoPage {
  items: SelectableTaskPhoto[];
  page: number;
  pageSize: number;
  total: number;
}

interface TaskPhotoSelectorProps {
  open: boolean;
  task: { id: string; name: string } | null;
  initialSelectedIds: string[];
  selectionInitialized: boolean;
  preferredMediaId?: string | null;
  onCancel: () => void;
  onConfirm: (photos: SelectableTaskPhoto[]) => void;
}

const pageSize = 18;
const statusOptions: Array<{ label: string; value: TaskPhotoStatusFilter }> = [
  { label: "全部", value: "all" },
  { label: "待分发", value: "pending" },
  { label: "已归档", value: "archived" },
  { label: "已忽略", value: "ignored" },
];

export function TaskPhotoSelector({
  open,
  task,
  initialSelectedIds,
  selectionInitialized,
  preferredMediaId,
  onCancel,
  onConfirm,
}: TaskPhotoSelectorProps) {
  const [photos, setPhotos] = useState<SelectableTaskPhoto[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<TaskPhotoStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !task) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setStatusFilter("all");
    setPage(1);

    void loadAllTaskPhotos(task.id, controller.signal)
      .then((items) => {
        setPhotos(items);
        const availableIds = new Set(items.map((item) => item.id));
        const nextSelection = selectionInitialized
          ? initialSelectedIds.filter((id) => availableIds.has(id))
          : defaultTaskPhotoSelection(items, preferredMediaId);
        setSelectedIds(new Set(nextSelection));
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "任务照片读取失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [initialSelectedIds, open, preferredMediaId, selectionInitialized, task]);

  const filteredPhotos = useMemo(
    () => filterTaskPhotos(photos, statusFilter),
    [photos, statusFilter],
  );
  const visiblePhotos = filteredPhotos.slice((page - 1) * pageSize, page * pageSize);
  const selectedPhotos = photos.filter((photo) => selectedIds.has(photo.id));
  const allFilteredSelected = filteredPhotos.length > 0
    && filteredPhotos.every((photo) => selectedIds.has(photo.id));

  const setFilteredSelected = (selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      filteredPhotos.forEach((photo) => {
        if (selected) next.add(photo.id);
        else next.delete(photo.id);
      });
      return next;
    });
  };

  return (
    <Modal
      className="task-photo-selector-modal"
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button
          key="confirm"
          disabled={loading || Boolean(error)}
          type="primary"
          onClick={() => onConfirm(selectedPhotos)}
        >
          确认使用 {selectedPhotos.length} 张
        </Button>,
      ]}
      open={open}
      title={task ? `选择任务照片 · ${task.name}` : "选择任务照片"}
      width={1080}
      onCancel={onCancel}
    >
      <div className="task-photo-selector-tools">
        <Segmented<TaskPhotoStatusFilter>
          options={statusOptions}
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
        />
        <div>
          <span>已选 {selectedPhotos.length} / {photos.length} 张</span>
          <Button
            icon={<CheckCheck size={15} />}
            onClick={() => setFilteredSelected(!allFilteredSelected)}
          >
            {allFilteredSelected ? "取消当前类型" : "全选当前类型"}
          </Button>
          <Button icon={<RotateCcw size={15} />} onClick={() => setSelectedIds(new Set())}>清空</Button>
        </div>
      </div>

      {loading ? (
        <div className="task-photo-selector-state"><Spin size="large" />正在读取任务照片</div>
      ) : error ? (
        <div className="task-photo-selector-state error">{error}</div>
      ) : visiblePhotos.length ? (
        <div className="task-photo-selector-grid">
          {visiblePhotos.map((photo) => {
            const checked = selectedIds.has(photo.id);
            return (
              <button
                className={checked ? "selected" : ""}
                key={photo.id}
                type="button"
                onClick={() => setSelectedIds((current) => setTaskPhotoSelected(current, photo.id, !checked))}
              >
                <img
                  alt={photo.mediaAsset.originalFileName}
                  src={getApiUrl(`/media-assets/${photo.mediaAsset.id}/content`)}
                />
                <Checkbox
                  checked={checked}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setSelectedIds((current) => (
                    setTaskPhotoSelected(current, photo.id, event.target.checked)
                  ))}
                />
                <Tag className={`task-photo-status ${photo.distributionStatus}`}>
                  {statusLabel(photo.distributionStatus)}
                </Tag>
                <span>{photo.mediaAsset.originalFileName}</span>
                <small>{formatTimestamp(photo.videoTimestampMs)}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty image={<Images size={44} />} description="当前筛选下没有照片" />
      )}

      {filteredPhotos.length > pageSize ? (
        <Pagination
          current={page}
          pageSize={pageSize}
          showSizeChanger={false}
          total={filteredPhotos.length}
          onChange={setPage}
        />
      ) : null}
    </Modal>
  );
}

async function loadAllTaskPhotos(taskId: string, signal: AbortSignal) {
  const items: SelectableTaskPhoto[] = [];
  let page = 1;
  while (true) {
    const result = await getApi<TaskPhotoPage>(
      `/inspection-tasks/${encodeURIComponent(taskId)}/photos?page=${page}&pageSize=100`,
      signal,
    );
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) return items;
    page += 1;
  }
}

function statusLabel(status: string) {
  if (status === "pending") return "待分发";
  if (status === "archived") return "已归档";
  if (status === "ignored") return "已忽略";
  return status;
}

function formatTimestamp(value: number | null) {
  if (value === null) return "直接上传照片";
  const seconds = Math.floor(value / 1000);
  const minutes = Math.floor(seconds / 60);
  return `视频 ${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
