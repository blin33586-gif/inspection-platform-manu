const localDevelopmentDatabaseUrl = "postgresql://xunjianbao:xunjianbao-local-dev@127.0.0.1:5432/xunjianbao?schema=public";

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const configuredUrl = env.DATABASE_URL?.trim();
  if (!configuredUrl && env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL must be configured in production");
  }
  const databaseUrl = configuredUrl || localDevelopmentDatabaseUrl;
  if (!databaseUrl.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL");
  }
  return databaseUrl;
}
