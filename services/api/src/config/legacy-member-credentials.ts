export interface LegacyMemberCredentials {
  username: string;
  password: string;
}

const defaultDevelopmentCredentials: LegacyMemberCredentials = {
  username: "member",
  password: "xunjianbao-member-2026",
};

export function resolveLegacyMemberCredentials(
  env: NodeJS.ProcessEnv,
  options: { required: boolean },
): LegacyMemberCredentials | null {
  const allowsDevelopmentDefaults = env.NODE_ENV === "development" || env.NODE_ENV === "test";
  const configuredUsername = env.MEMBER_USERNAME?.trim();
  const configuredPassword = env.MEMBER_PASSWORD;
  const hasUsername = Boolean(configuredUsername);
  const hasPassword = Boolean(configuredPassword);

  if (!hasUsername && !hasPassword) {
    if (!options.required) return null;
    if (!allowsDevelopmentDefaults) throw new Error("Safe-mode legacy member bootstrap requires explicit MEMBER_USERNAME and MEMBER_PASSWORD");
    return defaultDevelopmentCredentials;
  }

  if (!hasUsername || !hasPassword) {
    throw new Error("MEMBER_USERNAME and MEMBER_PASSWORD must be provided together");
  }
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(configuredUsername!)) {
    throw new Error("MEMBER_USERNAME must be a valid non-empty login name");
  }
  if (
    !allowsDevelopmentDefaults
    && (configuredPassword!.length < 12 || !/[A-Za-z]/.test(configuredPassword!) || !/\d/.test(configuredPassword!))
  ) {
    throw new Error("MEMBER_PASSWORD must be a strong password of at least 12 characters containing letters and numbers");
  }

  return { username: configuredUsername!, password: configuredPassword! };
}
