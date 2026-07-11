export const FRAME_INTERVAL_OPTIONS = [1, 2, 3, 4, 5].map((seconds) => ({
  label: `${seconds} 秒/帧`,
  value: seconds,
}));

export function getMediaTaskDetailPath(taskId: string) {
  return `/media-library/${encodeURIComponent(taskId)}`;
}

export function shouldOpenMediaTaskDetail(isPersisted: boolean | undefined) {
  return isPersisted === true;
}
