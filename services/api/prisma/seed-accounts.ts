import { hashPassword } from "../src/modules/auth/password-hash.js";
import { resolveLegacyMemberCredentials } from "../src/config/legacy-member-credentials.js";
import type { PrismaClient } from "@prisma/client";

type AccountDatabase = Pick<PrismaClient, "userAccount">;

export async function seedLegacyAccounts(database: AccountDatabase, env: NodeJS.ProcessEnv) {
  const administrator = await database.userAccount.findFirst({
    where: { role: "platform_admin" },
    select: { id: true },
  });
  const configuredUsername = env.MEMBER_USERNAME?.trim();
  const member = await database.userAccount.findFirst({
    where: {
      OR: [
        { id: "legacy-member" },
        { role: "member" },
        ...(configuredUsername ? [{ username: configuredUsername }] : []),
      ],
    },
    select: { id: true },
  });

  const administratorCredentials = administrator ? null : {
    username: env.ADMIN_USERNAME?.trim() || (env.NODE_ENV === "production" ? "" : "admin"),
    password: env.ADMIN_PASSWORD || (env.NODE_ENV === "production" ? "" : "xunjianbao2026"),
  };
  if (administratorCredentials && (!administratorCredentials.username || !administratorCredentials.password)) {
    throw new Error("Production administrator bootstrap requires explicit ADMIN_USERNAME and ADMIN_PASSWORD");
  }
  const memberCredentials = member ? null : resolveLegacyMemberCredentials(env, { required: true })!;

  if (administratorCredentials) {
    await database.userAccount.create({
      data: {
        id: "platform-admin",
        username: administratorCredentials.username,
        passwordHash: await hashPassword(administratorCredentials.password),
        name: "项目管理员",
        phone: "",
        role: "platform_admin",
        status: "active",
      },
    });
  }

  if (!memberCredentials) return;

  await database.userAccount.create({
    data: {
      id: "legacy-member",
      username: memberCredentials.username,
      passwordHash: await hashPassword(memberCredentials.password),
      name: "项目成员",
      phone: "",
      role: "member",
      status: "active",
      memberships: {
        create: [
          { id: "legacy-member-quyang", projectId: "quyang" },
          { id: "legacy-member-jinshan", projectId: "jinshan" },
        ],
      },
    },
  });
}
