import { runWithProjectContext } from "../modules/auth/project-context.js";

export const memberTestIdentity = {
  id: "member-42",
  sub: "member-42",
  username: "member.wu",
  name: "吴成员",
  role: "member" as const,
  tokenVersion: 1,
  projectIds: ["quyang"],
};

export const platformAdminTestIdentity = {
  id: "platform-admin",
  sub: "platform-admin",
  username: "admin",
  name: "平台管理员",
  role: "platform_admin" as const,
  tokenVersion: 1,
  projectIds: [],
};

export function runAsMember<T>(callback: () => T, projectId = "quyang") {
  return runWithProjectContext({ projectId, identity: memberTestIdentity }, callback);
}

export function runAsPlatformAdmin<T>(callback: () => T) {
  return runWithProjectContext({ identity: platformAdminTestIdentity }, callback);
}
