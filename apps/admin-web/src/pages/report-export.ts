export function getReportDownloadName(title: string) {
  const clean = title
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s*_\s*/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .trim();
  return `${clean || "巡检报告"}.pdf`;
}

export function canExportReport(hasLoaded: boolean, exporting: boolean) {
  return hasLoaded && !exporting;
}

export function createSingleFlightRunner() {
  let running = false;
  return {
    async run(task: () => Promise<void>) {
      if (running) return false;
      running = true;
      try {
        await task();
        return true;
      } finally {
        running = false;
      }
    },
  };
}
