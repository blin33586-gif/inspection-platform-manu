import type { DashboardSummary, IssueSummary, ManagedObjectSummary, ReportSummary } from "@xunjianbao/shared";

export const dashboardSummary: DashboardSummary = {
  inspectionsThisMonth: 18,
  issuesThisMonth: 126,
  pendingIssues: 31,
};

export const communities: ManagedObjectSummary[] = [
  { id: "c-yutian", name: "玉田新村", objectType: "community", status: "待复查", issueCount: 12, reportCount: 4 },
  { id: "c-chifeng", name: "赤峰小区", objectType: "community", status: "重点", issueCount: 9, reportCount: 3 },
  { id: "c-yunguang", name: "运光小区", objectType: "community", status: "稳定", issueCount: 4, reportCount: 2 },
];

export const roads: ManagedObjectSummary[] = [
  { id: "r-quyang", name: "曲阳路", objectType: "road", status: "重点", issueCount: 9, reportCount: 3 },
  { id: "r-miyun", name: "密云路", objectType: "road", status: "待复查", issueCount: 7, reportCount: 2 },
  { id: "r-yutian", name: "玉田路", objectType: "road", status: "稳定", issueCount: 3, reportCount: 1 },
];

export const reports: ReportSummary[] = [
  { id: "rp-0624", title: "玉田新村飞线与堆物巡检报告", reportDate: "2026-06-24", reportType: "community", relatedObjectName: "玉田新村", issueCount: 12 },
  { id: "rp-0622", title: "曲阳路沿街广告牌巡检报告", reportDate: "2026-06-22", reportType: "road", relatedObjectName: "曲阳路", issueCount: 9 },
  { id: "rp-0619", title: "密云路占道经营复查报告", reportDate: "2026-06-19", reportType: "road", relatedObjectName: "密云路", issueCount: 7 },
];

export const issues: IssueSummary[] = [
  { id: "is-001", title: "3 号楼外立面飞线充电", objectName: "玉田新村", category: "飞线", status: "pending", severity: "medium", foundAt: "2026-06-24" },
  { id: "is-002", title: "沿街门头广告牌松动", objectName: "曲阳路", category: "广告牌", status: "processing", severity: "normal", foundAt: "2026-06-22" },
  { id: "is-003", title: "路口占道经营复发", objectName: "密云路", category: "占道经营", status: "pending", severity: "medium", foundAt: "2026-06-19" },
  { id: "is-004", title: "楼顶疑似违规搭建", objectName: "运光小区", category: "违建", status: "verified", severity: "normal", foundAt: "2026-06-18" },
];

export const points = [
  { id: "p-river-001", name: "河道绿化带", pointType: "绿化河道", relatedObjectName: "曲阳路街道", status: "待完善", issueCount: 2 },
  { id: "p-sign-001", name: "曲阳路重点广告牌", pointType: "广告牌", relatedObjectName: "曲阳路", status: "待复查", issueCount: 3 },
];

export const mapAssets = [
  { id: "map-street-main", name: "曲阳路街道总览图", mapType: "街道总览", processStatus: "processed", hotAreaCount: 6 },
  { id: "map-yutian", name: "玉田新村小区示意图", mapType: "小区地图", processStatus: "processed", hotAreaCount: 3 },
];
