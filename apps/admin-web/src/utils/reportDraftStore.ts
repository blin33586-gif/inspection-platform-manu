import type { ReportSummary } from "@xunjianbao/shared";

const submittedReportsStorageKey = "xunjianbao:submitted-reports";

export function readSubmittedReports(): ReportSummary[] {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.localStorage.getItem(submittedReportsStorageKey);
    if (!rawValue) return [];

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue.filter(isReportSummary);
  } catch {
    return [];
  }
}

export function writeSubmittedReport(report: ReportSummary) {
  if (typeof window === "undefined") return;

  const currentReports = readSubmittedReports();
  const nextReports = [
    report,
    ...currentReports.filter((item) => item.id !== report.id),
  ];

  window.localStorage.setItem(submittedReportsStorageKey, JSON.stringify(nextReports));
}

function isReportSummary(value: unknown): value is ReportSummary {
  if (!value || typeof value !== "object") return false;

  const report = value as Partial<ReportSummary>;

  return (
    typeof report.id === "string"
    && typeof report.title === "string"
    && typeof report.reportDate === "string"
    && typeof report.reportType === "string"
    && typeof report.relatedObjectName === "string"
    && typeof report.issueCount === "number"
  );
}
