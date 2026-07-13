export const PRIMARY_NAV_ITEMS = [
  { to: "/media-library", label: "任务库" },
  { to: "/reports", label: "报告库" },
  { to: "/issues", label: "问题库" },
];

export const ACCOUNT_NAV_ITEMS = [
  { to: "/map-assets", label: "地图" },
  { to: "/audit-logs", label: "操作日志" },
];

const PROJECT_SWITCH_ITEM = { to: "/projects", label: "切换项目" };
const PLATFORM_MEMBER_ITEM = { to: "/platform/members", label: "人员管理" };

export function accountNavigation(role: string | undefined) {
  return [
    PROJECT_SWITCH_ITEM,
    ...ACCOUNT_NAV_ITEMS,
    ...(role === "platform_admin" ? [PLATFORM_MEMBER_ITEM] : []),
  ];
}
