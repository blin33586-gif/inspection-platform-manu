export interface RuntimeConfig {
  port: number;
  host: string;
  isProduction: boolean;
  adminUsername?: string;
  adminPassword?: string;
  memberUsername?: string;
  memberPassword?: string;
  authSecret?: string;
}

export function resolveRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  const isProduction = env.NODE_ENV === "production";
  const adminUsername = env.ADMIN_USERNAME;
  const adminPassword = env.ADMIN_PASSWORD;
  const memberUsername = env.MEMBER_USERNAME;
  const memberPassword = env.MEMBER_PASSWORD;
  const authSecret = env.AUTH_SECRET;

  if (isProduction && (!adminUsername || !adminPassword || !memberUsername || !memberPassword || !authSecret)) {
    throw new Error("Production requires ADMIN_USERNAME, ADMIN_PASSWORD, MEMBER_USERNAME, MEMBER_PASSWORD and AUTH_SECRET");
  }

  const port = Number(env.API_PORT ?? env.PORT ?? 3010);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API_PORT must be a valid TCP port");
  }

  return {
    port,
    host: env.API_HOST ?? "0.0.0.0",
    isProduction,
    adminUsername,
    adminPassword,
    memberUsername,
    memberPassword,
    authSecret,
  };
}
