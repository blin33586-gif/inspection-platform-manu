import SqliteDatabase from "better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveDatabaseUrl } from "../src/database/database-url.js";
import { normalizeLegacySqliteRow } from "../src/database/sqlite-postgres-migration.js";

const legacyTables = [
  "DashboardMetric",
  "IssueCategoryStat",
  "ManagedObject",
  "MapAsset",
  "Issue",
  "InspectionReport",
  "IssueAttachment",
  "MapHotArea",
  "AuditLog",
] as const;

type LegacyTable = (typeof legacyTables)[number];
type LegacyRows = Record<LegacyTable, Array<Record<string, unknown>>>;

function tableCounts(rows: LegacyRows) {
  return Object.fromEntries(legacyTables.map((table) => [table, rows[table].length]));
}

function readLegacyRows(source: SqliteDatabase.Database): LegacyRows {
  return Object.fromEntries(legacyTables.map((table) => [
    table,
    source.prepare(`SELECT * FROM "${table}"`).all().map((row) => normalizeLegacySqliteRow(row as Record<string, unknown>)),
  ])) as LegacyRows;
}

async function targetCounts(database: PrismaClient) {
  return {
    DashboardMetric: await database.dashboardMetric.count(),
    IssueCategoryStat: await database.issueCategoryStat.count(),
    ManagedObject: await database.managedObject.count(),
    MapAsset: await database.mapAsset.count(),
    Issue: await database.issue.count(),
    InspectionReport: await database.inspectionReport.count(),
    IssueAttachment: await database.issueAttachment.count(),
    MapHotArea: await database.mapHotArea.count(),
    AuditLog: await database.auditLog.count(),
  };
}

async function main() {
  const sourcePath = resolve(process.cwd(), process.env.SQLITE_SOURCE_PATH ?? "dev.db");
  if (!existsSync(sourcePath)) throw new Error(`SQLite source database was not found: ${sourcePath}`);

  const source = new SqliteDatabase(sourcePath, { readonly: true });
  const database = new PrismaClient({ adapter: new PrismaPg({ connectionString: resolveDatabaseUrl(process.env) }) });

  try {
    const sourceRows = readLegacyRows(source);
    const before = await targetCounts(database);
    if (Object.values(before).some((count) => count > 0)) {
      throw new Error("PostgreSQL target database must be empty before importing SQLite data");
    }

    await database.$transaction(async (transaction) => {
      if (sourceRows.DashboardMetric.length) await transaction.dashboardMetric.createMany({ data: sourceRows.DashboardMetric as never });
      if (sourceRows.IssueCategoryStat.length) await transaction.issueCategoryStat.createMany({ data: sourceRows.IssueCategoryStat as never });
      if (sourceRows.ManagedObject.length) await transaction.managedObject.createMany({ data: sourceRows.ManagedObject as never });
      if (sourceRows.MapAsset.length) await transaction.mapAsset.createMany({ data: sourceRows.MapAsset as never });
      if (sourceRows.Issue.length) await transaction.issue.createMany({ data: sourceRows.Issue as never });
      if (sourceRows.InspectionReport.length) await transaction.inspectionReport.createMany({ data: sourceRows.InspectionReport as never });
      if (sourceRows.IssueAttachment.length) await transaction.issueAttachment.createMany({ data: sourceRows.IssueAttachment as never });
      if (sourceRows.MapHotArea.length) await transaction.mapHotArea.createMany({ data: sourceRows.MapHotArea as never });
      if (sourceRows.AuditLog.length) await transaction.auditLog.createMany({ data: sourceRows.AuditLog as never });
    });

    const after = await targetCounts(database);
    const expected = tableCounts(sourceRows);
    if (JSON.stringify(after) !== JSON.stringify(expected)) {
      throw new Error(`PostgreSQL row counts did not match the SQLite source: ${JSON.stringify({ expected, after })}`);
    }

    console.log(`SQLite data import complete: ${JSON.stringify(after)}`);
  } finally {
    source.close();
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
