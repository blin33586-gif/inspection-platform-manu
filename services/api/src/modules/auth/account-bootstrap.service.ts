import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { hashPassword } from "./password-hash.js";

@Injectable()
export class AccountBootstrapService implements OnModuleInit {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async onModuleInit() {
    const administrator = await this.database.userAccount.findFirst({
      where: { role: "platform_admin" },
      select: { id: true },
    });

    if (!administrator) {
      await this.database.userAccount.create({
        data: {
          id: "platform-admin",
          username: process.env.ADMIN_USERNAME ?? "admin",
          passwordHash: await hashPassword(process.env.ADMIN_PASSWORD ?? "xunjianbao2026"),
          name: "项目管理员",
          phone: "",
          role: "platform_admin",
        },
      });
    }

    const memberUsername = process.env.MEMBER_USERNAME ?? "member";
    const member = await this.database.userAccount.findUnique({
      where: { username: memberUsername },
      select: { id: true },
    });

    if (!member) {
      await this.database.userAccount.create({
        data: {
          id: "legacy-member",
          username: memberUsername,
          passwordHash: await hashPassword(process.env.MEMBER_PASSWORD ?? "xunjianbao-member-2026"),
          name: "项目成员",
          phone: "",
          role: "member",
          memberships: {
            create: [
              { id: "legacy-member-quyang", projectId: "quyang" },
              { id: "legacy-member-jinshan", projectId: "jinshan" },
            ],
          },
        },
      });
    }
  }
}
