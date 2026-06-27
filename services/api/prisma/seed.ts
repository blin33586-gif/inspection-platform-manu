import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  }),
});

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.mapHotArea.deleteMany();
  await prisma.mapAsset.deleteMany();
  await prisma.inspectionReport.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.managedObject.deleteMany();
  await prisma.issueCategoryStat.deleteMany();
  await prisma.dashboardMetric.deleteMany();

  await prisma.dashboardMetric.createMany({
    data: [
      { key: "inspectionsThisMonth", label: "本月巡检", value: 18 },
      { key: "issuesThisMonth", label: "本月发现问题", value: 126 },
      { key: "pendingIssues", label: "待处理", value: 31 },
    ],
  });

  await prisma.issueCategoryStat.createMany({
    data: [
      { id: "stat-flying-wire", category: "飞线整治", value: 32, sort: 1 },
      { id: "stat-occupy-road", category: "占道经营", value: 26, sort: 2 },
      { id: "stat-illegal-build", category: "违建隐患", value: 18, sort: 3 },
      { id: "stat-green-river", category: "绿化河道", value: 14, sort: 4 },
    ],
  });

  await prisma.managedObject.createMany({
    data: [
      { id: "c-yutian", name: "玉田新村", objectType: "community", status: "待复查", issueCount: 12, reportCount: 4 },
      { id: "c-chifeng", name: "赤峰小区", objectType: "community", status: "重点", issueCount: 9, reportCount: 3 },
      { id: "c-yunguang", name: "运光小区", objectType: "community", status: "稳定", issueCount: 4, reportCount: 2 },
      { id: "r-quyang", name: "曲阳路", objectType: "road", status: "重点", issueCount: 9, reportCount: 3 },
      { id: "r-miyun", name: "密云路", objectType: "road", status: "待复查", issueCount: 7, reportCount: 2 },
      { id: "r-yutian", name: "玉田路", objectType: "road", status: "稳定", issueCount: 3, reportCount: 1 },
      { id: "p-river-001", name: "河道绿化带", objectType: "point", objectSubtype: "绿化河道", parentName: "曲阳路街道", status: "待完善", issueCount: 2, reportCount: 0 },
      { id: "p-sign-001", name: "曲阳路重点广告牌", objectType: "point", objectSubtype: "广告牌", parentName: "曲阳路", status: "待复查", issueCount: 3, reportCount: 0 },
    ],
  });

  await prisma.issue.createMany({
    data: [
      { id: "is-001", title: "3 号楼外立面飞线充电", objectId: "c-yutian", category: "飞线", status: "pending", severity: "medium", foundAt: new Date("2026-06-24") },
      { id: "is-002", title: "沿街门头广告牌松动", objectId: "r-quyang", category: "广告牌", status: "processing", severity: "normal", foundAt: new Date("2026-06-22") },
      { id: "is-003", title: "路口占道经营复发", objectId: "r-miyun", category: "占道经营", status: "pending", severity: "medium", foundAt: new Date("2026-06-19") },
      { id: "is-004", title: "楼顶疑似违规搭建", objectId: "c-yunguang", category: "违建", status: "verified", severity: "normal", foundAt: new Date("2026-06-18") },
    ],
  });

  await prisma.inspectionReport.createMany({
    data: [
      { id: "rp-0624", title: "玉田新村飞线与堆物巡检报告", reportDate: new Date("2026-06-24"), reportType: "community", relatedObjectId: "c-yutian", relatedObjectName: "玉田新村", issueCount: 12 },
      { id: "rp-0622", title: "曲阳路沿街广告牌巡检报告", reportDate: new Date("2026-06-22"), reportType: "road", relatedObjectId: "r-quyang", relatedObjectName: "曲阳路", issueCount: 9 },
      { id: "rp-0619", title: "密云路占道经营复查报告", reportDate: new Date("2026-06-19"), reportType: "road", relatedObjectId: "r-miyun", relatedObjectName: "密云路", issueCount: 7 },
    ],
  });

  await prisma.mapAsset.createMany({
    data: [
      { id: "map-street-main", name: "曲阳路街道总览图", mapType: "街道总览", sourceType: "image", fileName: "quyang-street-main.png", processStatus: "processed", hotAreaCount: 6 },
      { id: "map-yutian", name: "玉田新村小区示意图", mapType: "小区地图", sourceType: "tiff", fileName: "yutian-community.tif", processStatus: "processed", hotAreaCount: 3 },
    ],
  });

  await prisma.mapHotArea.createMany({
    data: [
      { id: "ha-yutian", mapAssetId: "map-street-main", label: "玉田新村", objectType: "community", objectId: "c-yutian", x: 18, y: 32, width: 24, height: 18 },
      { id: "ha-quyang", mapAssetId: "map-street-main", label: "曲阳路", objectType: "road", objectId: "r-quyang", x: 46, y: 50, width: 20, height: 8 },
      { id: "ha-river", mapAssetId: "map-street-main", label: "河道绿化带", objectType: "point", objectId: "p-river-001", x: 9, y: 78, width: 31, height: 7 },
      { id: "ha-yutian-gate", mapAssetId: "map-yutian", label: "玉田新村出入口", objectType: "community", objectId: "c-yutian", x: 28, y: 21, width: 16, height: 12 },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
