const sqliteDateColumns = new Set(["createdAt", "updatedAt", "foundAt", "reportDate"]);

type NormalizedSqliteRow<T extends Record<string, unknown>> = {
  [Key in keyof T]: Key extends "createdAt" | "updatedAt" | "foundAt" | "reportDate"
    ? Date
    : Key extends "isActive"
      ? boolean
      : T[Key];
};

export function normalizeLegacySqliteRow<T extends Record<string, unknown>>(row: T): NormalizedSqliteRow<T> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (sqliteDateColumns.has(key)) return [key, toDate(value, key)];
    if (key === "isActive") return [key, Boolean(value)];
    return [key, value];
  })) as NormalizedSqliteRow<T>;
}

function toDate(value: unknown, column: string): Date {
  const date = value instanceof Date ? value : new Date(typeof value === "number" ? value : String(value));
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid SQLite date value in ${column}`);
  return date;
}
