import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { hashPassword } from "../auth/password-hash.js";
import { currentIdentity } from "../auth/project-context.js";

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
    this.requirePlatformAdministrator();
    const members = await this.database.userAccount.findMany({
      where: { role: "member" },
      orderBy: { createdAt: "desc" },
      include: memberInclude,
    });
    return members.map((member) => this.toDto(member));
  }

  async create(input: CreatePlatformMemberInput): Promise<PlatformMemberDto> {
    const administrator = this.requirePlatformAdministrator();
    this.assertInputObject(input);
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
      })
        .catch((error: unknown) => {
          if (this.isUsernameUniqueConstraintError(error)) {
            throw new ConflictException("用户名已存在");
          }
          throw error;
        });

      await transaction.platformAuditLog.create({
        data: {
          id: randomUUID(),
          actorId: administrator.id,
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
  ): Promise<PlatformMemberDto> {
    const administrator = this.requirePlatformAdministrator();
    this.assertInputObject(input);
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

      const currentProjectIds = current.memberships.map((membership) => membership.projectId);
      const projectsChanged = projectIds !== undefined
        && !this.sameProjectSet(currentProjectIds, projectIds);
      const statusChanged = status !== undefined && status !== current.status;
      const nameChanged = name !== undefined && name !== current.name;
      const phoneChanged = phone !== undefined && phone !== current.phone;

      if (!projectsChanged && !statusChanged && !nameChanged && !phoneChanged) {
        return this.toDto(current);
      }

      const projects = !projectsChanged
        ? undefined
        : await transaction.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true },
        });
      if (projectsChanged && projectIds && projects) {
        this.assertAllProjectsExist(projectIds, projects);
      }

      if (projectsChanged && projectIds) {
        await transaction.projectMembership.deleteMany({ where: { userId: id } });
        await transaction.projectMembership.createMany({
          data: projectIds.map((projectId) => ({ id: randomUUID(), userId: id, projectId })),
        });
      }

      const invalidatesSession = projectsChanged || statusChanged;
      const member = await transaction.userAccount.update({
        where: { id },
        data: {
          ...(nameChanged ? { name } : {}),
          ...(phoneChanged ? { phone } : {}),
          ...(statusChanged ? { status } : {}),
          ...(invalidatesSession ? { tokenVersion: { increment: 1 } } : {}),
        },
        include: memberInclude,
      });

      const action = projectsChanged
        ? "member.projects.update"
        : statusChanged
          ? "member.status.update"
          : "member.profile.update";
      const summaryParts = [
        nameChanged ? `姓名：${name}` : undefined,
        phoneChanged ? `手机号：${phone}` : undefined,
        projects === undefined ? undefined : `项目：${projects.map((project) => project.name).join("、")}`,
        statusChanged ? `状态：${status === "active" ? "启用" : "停用"}` : undefined,
      ].filter((part): part is string => Boolean(part));

      await transaction.platformAuditLog.create({
        data: {
          id: randomUUID(),
          actorId: administrator.id,
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
  ): Promise<PlatformMemberDto> {
    const administrator = this.requirePlatformAdministrator();
    this.assertInputObject(input);
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
          actorId: administrator.id,
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

  private requirePlatformAdministrator() {
    const identity = currentIdentity();
    if (!identity || identity.role !== "platform_admin") {
      throw new ForbiddenException("platform administrator identity is required");
    }
    return identity;
  }

  private requiredText(value: unknown, message: string) {
    if (typeof value !== "string") throw new BadRequestException(message);
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(message);
    return normalized;
  }

  private validPhone(value: unknown) {
    if (typeof value !== "string") throw new BadRequestException("手机号格式无效");
    const phone = value.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new BadRequestException("手机号格式无效");
    return phone;
  }

  private validPassword(value: unknown) {
    if (typeof value !== "string" || value.length < 8) {
      throw new BadRequestException("密码至少需要 8 个字符");
    }
    return value;
  }

  private validProjectIds(value: unknown) {
    if (!Array.isArray(value)) throw new BadRequestException("项目列表无效");
    if (value.length === 0) throw new BadRequestException("成员至少需要分配一个项目");
    if (value.some((id) => typeof id !== "string" || !id.trim())) {
      throw new BadRequestException("项目 ID 必须是非空字符串");
    }
    const projectIds = value.map((id) => (id as string).trim());
    if (new Set(projectIds).size !== projectIds.length) {
      throw new BadRequestException("项目 ID 不得重复");
    }
    return projectIds;
  }

  private assertInputObject(value: unknown): asserts value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException("请求内容无效");
    }
  }

  private sameProjectSet(left: string[], right: string[]) {
    return left.length === right.length && new Set(left).size === new Set([...left, ...right]).size;
  }

  private isUsernameUniqueConstraintError(error: unknown) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") {
      return false;
    }
    if (!("meta" in error) || !error.meta || typeof error.meta !== "object") return false;
    const target = "target" in error.meta ? error.meta.target : undefined;
    if (Array.isArray(target)) return target.includes("username");
    return typeof target === "string"
      && target.split(/[^A-Za-z0-9]+/).includes("username");
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

}
