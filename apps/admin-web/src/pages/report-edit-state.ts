export interface EditableReportRecord {
  id: string;
  taskId?: string | null;
  taskPhotoIds?: string[];
  title: string;
  reportDate: string;
  relatedObjectName: string;
  issueCount: number;
  contentSummary?: string | null;
}

export function toEditableReportDraft(report: EditableReportRecord) {
  return {
    title: report.title,
    reportDate: report.reportDate.slice(0, 10),
    reportArea: report.relatedObjectName,
    issueCount: report.issueCount,
    contentSummary: report.contentSummary ?? "",
    taskPhotoIds: [...(report.taskPhotoIds ?? [])],
  };
}

export function reportWritePath(taskId: string) {
  return `/reports/write?taskId=${encodeURIComponent(taskId)}`;
}

export function effectiveReportTaskPhotoIds(input: {
  currentTaskId: string;
  workspaceTaskId: string | null;
  workspacePhotoIds: string[];
  restoredTaskId: string | null;
  restoredPhotoIds: string[];
}) {
  if (input.workspaceTaskId === input.currentTaskId) return [...input.workspacePhotoIds];
  if (input.restoredTaskId === input.currentTaskId) return [...input.restoredPhotoIds];
  return [...input.workspacePhotoIds];
}

export function mergeReportTaskOptions<T extends { id: string }>(items: T[], directTask: T | null) {
  if (!directTask) return items;
  const existingIndex = items.findIndex((item) => item.id === directTask.id);
  if (existingIndex === -1) return [...items, directTask];
  return items.map((item, index) => index === existingIndex ? directTask : item);
}
