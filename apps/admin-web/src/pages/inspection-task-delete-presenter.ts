export interface InspectionTaskDeleteSummary {
  name: string;
  photoCount: number;
  pendingPhotoCount: number;
  reportId: string | null;
}

export function describeTaskPurgeImpact(task: InspectionTaskDeleteSummary) {
  const reportText = task.reportId ? "和 1 份综合报告" : "，暂无综合报告";
  return `将永久删除「${task.name}」及其 ${task.photoCount} 张任务照片、${task.pendingPhotoCount} 张待分发照片${reportText}。由这些照片推送的问题、分享卡和问题附件也会一并删除；对象档案本身不会删除。`;
}
