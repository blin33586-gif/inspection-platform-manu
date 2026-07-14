export function getReportDownloadName(title: string) {
  const clean = title
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s*_\s*/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .trim();
  return `${clean || "巡检报告"}.pdf`;
}
