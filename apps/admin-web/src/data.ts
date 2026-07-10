import type { DashboardSummary, IssueSummary, ManagedObjectSummary, MapAssetSummary, PointSummary, ReportSummary } from "@xunjianbao/shared";

export interface MediaLibraryItem {
  id: string;
  title: string;
  linkedObjectId?: string;
  linkedObjectName: string;
  issueTitle: string;
  status: string;
  capturedAt: string;
  sourceName: string;
  thumbnailUrl: string;
  fileName: string;
}

function mediaThumbnail(title: string, accent: string, bg: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${bg}"/>
          <stop offset="1" stop-color="#f8fbff"/>
        </linearGradient>
      </defs>
      <rect width="640" height="420" fill="url(#g)"/>
      <path d="M48 285 C145 228 198 245 278 211 C362 175 430 166 593 121" fill="none" stroke="#ffffff" stroke-width="34" stroke-linecap="round" opacity=".82"/>
      <path d="M42 326 C152 295 236 321 330 286 C436 247 518 254 615 224" fill="none" stroke="${accent}" stroke-width="52" stroke-linecap="round" opacity=".25"/>
      <rect x="56" y="48" width="528" height="324" rx="22" fill="none" stroke="${accent}" stroke-width="8" opacity=".42"/>
      <circle cx="498" cy="112" r="42" fill="${accent}" opacity=".18"/>
      <circle cx="505" cy="112" r="18" fill="${accent}"/>
      <text x="70" y="352" fill="#102033" font-family="Arial, sans-serif" font-size="34" font-weight="700">${title}</text>
    </svg>
  `;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

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

export const points: PointSummary[] = [
  { id: "p-sign-001", name: "曲阳路重点广告牌", pointType: "广告牌", relatedObjectName: "曲阳路", status: "待复查", issueCount: 3, reportCount: 0 },
  { id: "p-river-001", name: "河道绿化带", pointType: "绿化河道", relatedObjectName: "曲阳路街道", status: "待完善", issueCount: 2, reportCount: 0 },
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

export const mediaLibraryItems: MediaLibraryItem[] = [
  {
    id: "media-chifeng-001",
    title: "赤峰小区楼道堆物照片",
    linkedObjectId: "c-chifeng",
    linkedObjectName: "赤峰小区",
    issueTitle: "楼道公共区域堆物",
    status: "待整改",
    capturedAt: "2026-07-03 09:42",
    sourceName: "媒体库",
    thumbnailUrl: mediaThumbnail("赤峰小区楼道堆物", "#f59a23", "#cfe8ff"),
    fileName: "MEDIA_20260703_CHIFENG_001.jpg",
  },
  {
    id: "media-chifeng-002",
    title: "赤峰小区飞线隐患照片",
    linkedObjectId: "c-chifeng",
    linkedObjectName: "赤峰小区",
    issueTitle: "楼栋外立面飞线充电",
    status: "待复查",
    capturedAt: "2026-07-03 10:18",
    sourceName: "媒体库",
    thumbnailUrl: mediaThumbnail("赤峰小区飞线隐患", "#e74747", "#d9f0ff"),
    fileName: "MEDIA_20260703_CHIFENG_002.jpg",
  },
  {
    id: "media-quyang-001",
    title: "曲阳路广告牌巡检照片",
    linkedObjectId: "r-quyang",
    linkedObjectName: "曲阳路",
    issueTitle: "沿街门头广告牌破损",
    status: "待整改",
    capturedAt: "2026-07-02 16:30",
    sourceName: "媒体库",
    thumbnailUrl: mediaThumbnail("曲阳路广告牌破损", "#0071e3", "#e3f2ff"),
    fileName: "MEDIA_20260702_QUYANG_001.jpg",
  },
  {
    id: "media-yutian-001",
    title: "玉田新村飞线巡检照片",
    linkedObjectId: "c-yutian",
    linkedObjectName: "玉田新村",
    issueTitle: "3 号楼外立面飞线充电",
    status: "待整改",
    capturedAt: "2026-06-24 09:45",
    sourceName: "媒体库",
    thumbnailUrl: mediaThumbnail("玉田新村飞线充电", "#20a66a", "#eef8ff"),
    fileName: "MEDIA_20260624_YUTIAN_001.jpg",
  },
  {
    id: "media-river-001",
    title: "河道绿化带巡检照片",
    linkedObjectId: "p-river-001",
    linkedObjectName: "河道绿化带",
    issueTitle: "绿化带杂物堆放",
    status: "已整改",
    capturedAt: "2026-06-30 10:25",
    sourceName: "媒体库",
    thumbnailUrl: mediaThumbnail("河道绿化带杂物", "#20a66a", "#dff7ee"),
    fileName: "MEDIA_20260630_RIVER_001.jpg",
  },
  {
    id: "media-sign-001",
    title: "重点广告牌复查照片",
    linkedObjectId: "p-sign-001",
    linkedObjectName: "曲阳路重点广告牌",
    issueTitle: "重点广告牌固定件松动",
    status: "待复查",
    capturedAt: "2026-07-01 14:20",
    sourceName: "媒体库",
    thumbnailUrl: mediaThumbnail("重点广告牌复查", "#f59a23", "#e8f2ff"),
    fileName: "MEDIA_20260701_SIGN_001.jpg",
  },
];

export const issueDistribution = [
  { category: "飞线整治", value: 32 },
  { category: "占道经营", value: 26 },
  { category: "违建隐患", value: 18 },
  { category: "绿化河道", value: 14 },
];

export const mapAssets: MapAssetSummary[] = [
  { id: "map-street-main", name: "曲阳路街道总览图", mapType: "街道总览", sourceType: "image", processStatus: "processed", hotAreaCount: 6 },
  { id: "map-yutian", name: "玉田新村小区示意图", mapType: "小区地图", sourceType: "tiff", processStatus: "processed", hotAreaCount: 3 },
];
