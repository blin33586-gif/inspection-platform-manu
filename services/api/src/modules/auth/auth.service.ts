import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

interface LoginInput {
  username?: string;
  password?: string;
}

export type UserRole = "admin" | "member";

export interface AuthIdentity {
  sub: string;
  name: string;
  role: UserRole;
  projectIds: string[];
}

export interface ProjectAccessItem {
  id: "quyang" | "jinshan";
  name: string;
  shortName: string;
  customerType: string;
  archiveDimensions: Array<{
    key: "community" | "road" | "point";
    label: string;
  }>;
}

interface SignedPayload extends AuthIdentity {
  exp: number;
  iat: number;
}

const projectCatalog: ProjectAccessItem[] = [
  {
    id: "quyang",
    name: "曲阳街道城管巡检项目",
    shortName: "曲阳街道",
    customerType: "街道城管",
    archiveDimensions: [
      { key: "community", label: "小区档案" },
      { key: "road", label: "道路街面" },
      { key: "point", label: "重点点位" },
    ],
  },
  {
    id: "jinshan",
    name: "金山化工园区项目",
    shortName: "金山化工园区",
    customerType: "化工园区",
    archiveDimensions: [
      { key: "community", label: "企业档案" },
      { key: "road", label: "道路档案" },
      { key: "point", label: "河道档案" },
    ],
  },
];

@Injectable()
export class AuthService {
  private readonly secret = process.env.AUTH_SECRET ?? "xunjianbao-local-secret";
  private readonly tokenLifetimeMs = 12 * 60 * 60 * 1000;

  login(input: LoginInput) {
    const account = this.accounts().find((candidate) => candidate.username === input.username);
    if (!account || !this.matches(input.password ?? "", account.password)) {
      throw new UnauthorizedException("Invalid username or password");
    }

    const identity: AuthIdentity = {
      sub: account.username,
      name: account.name,
      role: account.role,
      projectIds: account.projectIds,
    };
    const now = Date.now();

    return {
      token: this.sign({ ...identity, iat: now, exp: now + this.tokenLifetimeMs }),
      user: {
        username: identity.sub,
        name: identity.name,
        role: identity.role,
        projectIds: identity.projectIds,
      },
    };
  }

  verifyToken(token: string | undefined): AuthIdentity | null {
    if (!token) return null;

    const [body, signature] = token.split(".");
    if (!body || !signature) return null;

    const expectedSignature = createHmac("sha256", this.secret).update(body).digest("base64url");
    if (!this.matches(signature, expectedSignature)) return null;

    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SignedPayload;
      const account = this.accounts().find((candidate) => candidate.username === payload.sub);
      if (!account || payload.exp <= Date.now()) return null;
      if (payload.role !== account.role) return null;
      return {
        sub: payload.sub,
        name: payload.name,
        role: payload.role,
        projectIds: payload.projectIds.filter((projectId) => account.projectIds.includes(projectId)),
      };
    } catch {
      return null;
    }
  }

  projectsFor(identity: AuthIdentity) {
    return projectCatalog.filter((project) => identity.projectIds.includes(project.id));
  }

  private accounts(): Array<{
    username: string;
    password: string;
    name: string;
    role: UserRole;
    projectIds: string[];
  }> {
    return [
      {
        username: process.env.ADMIN_USERNAME ?? "admin",
        password: process.env.ADMIN_PASSWORD ?? "xunjianbao2026",
        name: "项目管理员",
        role: "admin",
        projectIds: ["quyang", "jinshan"],
      },
      {
        username: process.env.MEMBER_USERNAME ?? "member",
        password: process.env.MEMBER_PASSWORD ?? "xunjianbao-member-2026",
        name: "项目成员",
        role: "member",
        projectIds: ["quyang", "jinshan"],
      },
    ];
  }

  private sign(payload: SignedPayload) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.secret).update(body).digest("base64url");
    return `${body}.${signature}`;
  }

  private matches(input: string, expected: string) {
    const inputBuffer = Buffer.from(input);
    const expectedBuffer = Buffer.from(expected);
    if (inputBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(inputBuffer, expectedBuffer);
  }
}
