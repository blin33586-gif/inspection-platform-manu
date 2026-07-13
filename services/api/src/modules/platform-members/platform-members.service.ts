import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { hashPassword } from "../auth/password-hash.js";

export interface PlatformMemberDto {
  id: string;
  name: string;
  phone: string;
  username: string;
  status: "active" | "disabled";
  projectIds: string[];
  projectNames: string[];
  createdAt: string;
}

export interface CreatePlatformMemberInput {
  name?: string;
  phone?: string;
  username?: string;
  password?: string;
  projectIds?: string[];
}

export interface UpdatePlatformMemberInput {
  name?: string;
  phone?: string;
  projectIds?: string[];
  status?: "active" | "disabled";
}

interface MemberAccountSource {
  id: string;
  name: string;
  phone: string;
  username: string;
  status: string;
  createdAt: Date;
  memberships: Array<{
    projectId: string;
    project: { id: string; name: string };
  }>;
}

const memberInclude = {
  memberships: {
    orderBy: { createdAt: "asc" as const },
    include: { project: { select: { id: true, name: true } } },
  },
};

@Injectable()
export class PlatformMembersService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(): Promise<PlatformMemberDto[]> {
    const members = await this.database.userAccount.findMany({
      where: { role: "member" },
      orderBy: { createdAt: "desc" },
      include: memberInclude,
    });
    return members.map((member) => this.toDto(member));
  }

  async create(input: CreatePlatformMemberInput, actorId?: string): Promise<PlatformMemberDto> {
    const name = this.requiredText(input.name, "姓名不能为空");
    const phone = this.validPhone(input.phone);
    const username = this.requiredText(input.username, "用户名不能为空");
    const password = this.validPassword(input.password);
    const projectIds = this.validProjectIds(input.projectIds);
    const passwordHash = await hashPassword(password);

    return this.database.$transaction(async (transaction) => {
      const duplicate = await transaction.userAccount.findUnique({
        where: { username },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException("用户名已存在");

      const projects = await transaction.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true },
      });
      this.assertAllProjectsExist(projectIds, projects);

      const member = await transaction.userAccount.create({
        data: {
          id: randomUUID(),
          name,
          phone,
          username,
          passwordHash,
          role: "member",
          status: "active",
          memberships: {
            create: projectIds.map((projectId) => ({
              id: randomUUID(),
              projectId,
            })),
          },
        },
        include: memberInclude,
      });

      await transaction.platformAuditLog.create({
        data: {
          id: randomUUID(),
          actorId: await this.auditActorId(transaction, actorId),
          action: "member.create",
          targetId: member.id,
          summary: `创建成员“${name}”，分配项目：${projects.map((project) => project.name).join("、")}`,
        },
      });

      return this.toDto(member, projects);
    });
  }

  async update(
    id: string,
    input: UpdatePlatformMemberInput,
    actorId?: string,
  ): Promise<PlatformMemberDto> {
    const name = input.name === undefined
      ? undefined
      : this.requiredText(input.name, "姓名不能为空");
    const phone = input.phone === undefined ? undefined : this.validPhone(input.phone);
    const projectIds = input.projectIds === undefined ? undefined : this.validProjectIds(input.projectIds);
    const status = input.status;
    if (status !== undefined && status !== "active" && status !== "disabled") {
      throw new BadRequestException("成员状态无效");
    }
    if (name === undefined && phone === undefined && projectIds === undefined && status === undefined) {
      throw new BadRequestException("未提供可更新内容");
    }

    return this.database.$transaction(async (transaction) => {
      const current = await transaction.userAccount.findUnique({
        where: { id },
        include: memberInclude,
      });
      this.assertEditableMember(current);

      const projects = projectIds === undefined
        ? undefined
        : await transaction.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true },
        });
      if (projectIds && projects) this.assertAllProjectsExist(projectIds, projects);

      if (projectIds) {
        await transaction.projectMembership.deleteMany({ where: { userId: id } });
        await transaction.projectMembership.createMany({
          data: projectIds.map((projectId) => ({ id: randomUUID(), userId: id, projectId })),
        });
      }

      const invalidatesSession = projectIds !== undefined || status !== undefined;
      const member = await transaction.userAccount.update({
        where: { id },
        data: {
          ...(name === undefined ? {} : { name }),
          ...(phone === undefined ? {} : { phone }),
          ...(status === undefined ? {} : { status }),
          ...(invalidatesSession ? { tokenVersion: { increment: 1 } } : {}),
        },
        include: memberInclude,
      });

      const action = projectIds !== undefined
        ? "member.projects.update"
        : status !== undefined
          ? "member.status.update"
          : "member.profile.update";
      const summaryParts = [
        name === undefined ? undefined : `姓名：${name}`,
        phone === undefined ? undefined : `手机号：${phone}`,
        projects === undefined ? undefined : `项目：${projects.map((project) => project.name).join("、")}`,
        status === undefined ? undefined : `状态：${status === "active" ? "启用" : "停用"}`,
      ].filter((part): part is string => Boolean(part));

      await transaction.platformAuditLog.create({
        data: {
          id: randomUUID(),
          actorId: await this.auditActorId(transaction, actorId),
          action,
          targetId: id,
          summary: `更新成员“${current!.name}”：${summaryParts.join("；")}`,
        },
      });

      return this.toDto(member, projects);
    });
  }

  async resetPassword(
    id: string,
    input: { password?: string },
    actorId?: string,
  ): Promise<PlatformMemberDto> {
    const password = this.validPassword(input.password);
    const passwordHash = await hashPassword(password);

    return this.database.$transaction(async (transaction) => {
      const current = await transaction.userAccount.findUnique({
        where: { id },
        include: memberInclude,
      });
      this.assertEditableMember(current);

      const member = await transaction.userAccount.update({
        where: { id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
        include: memberInclude,
      });
      await transaction.platformAuditLog.create({
        data: {
          id: randomUUID(),
          actorId: await this.auditActorId(transaction, actorId),
          action: "member.password.reset",
          targetId: id,
          summary: `已重置成员“${current!.name}”的密码`,
        },
      });

      return this.toDto(member);
    });
  }

  private toDto(
    member: MemberAccountSource,
    projects?: Array<{ id: string; name: string }>,
  ): PlatformMemberDto {
    const assignedProjects = projects
      ?? member.memberships.map((membership) => membership.project);
    return {
      id: member.id,
      name: member.name,
      phone: member.phone,
      username: member.username,
      status: member.status === "disabled" ? "disabled" : "active",
      projectIds: assignedProjects.map((project) => project.id),
      projectNames: assignedProjects.map((project) => project.name),
      createdAt: member.createdAt.toISOString(),
    };
  }

  private requiredText(value: string | undefined, message: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(message);
    return normalized;
  }

  private validPhone(value: string | undefined) {
    const phone = value?.trim() ?? "";
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new BadRequestException("手机号格式无效");
    return phone;
  }

  private validPassword(value: string | undefined) {
    if (!value || value.length < 8) throw new BadRequestException("密码至少需要 8 个字符");
    return value;
  }

  private validProjectIds(value: string[] | undefined) {
    const projectIds = Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))]
      : [];
    if (projectIds.length === 0) throw new BadRequestException("成员至少需要分配一个项目");
    return projectIds;
  }

  private assertAllProjectsExist(
    projectIds: string[],
    projects: Array<{ id: string; name: string }>,
  ) {
    if (projects.length !== projectIds.length) throw new BadRequestException("项目不存在");
  }

  private assertEditableMember(account: { role: string } | null): asserts account is { role: string } {
    if (!account) throw new NotFoundException("成员不存在");
    if (account.role === "platform_admin") throw new BadRequestException("平台管理员不可编辑");
    if (account.role !== "member") throw new BadRequestException("账号类型不可编辑");
  }

  private async auditActorId(
    transaction: Pick<DatabaseService, "userAccount">,
    actorId: string | undefined,
  ) {
    if (actorId) return actorId;
    const administrator = await transaction.userAccount.findFirst({
      where: { role: "platform_admin" },
      select: { id: true },
    });
    if (!administrator) throw new BadRequestException("平台管理员不存在");
    return administrator.id;
  }
}
