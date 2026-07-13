import { Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { DUMMY_PASSWORD_HASH, isScryptPasswordHash, PasswordVerifier } from "./password-hash.js";

interface LoginInput {
  username?: string;
  password?: string;
}

export type UserRole = "platform_admin" | "member";

export interface AuthIdentity {
  id: string;
  sub: string;
  username: string;
  name: string;
  role: UserRole;
  tokenVersion: number;
  projectIds: string[];
}

export interface ProjectAccessItem {
  id: string;
  name: string;
  shortName: string;
  customerType: string;
  archiveDimensions: Array<{
    key: "community" | "road" | "point";
    label: string;
  }>;
}

interface SignedPayload {
  sub: string;
  ver: number;
  exp: number;
  iat: number;
}

interface AccountIdentitySource {
  id: string;
  username: string;
  name: string;
  role: string;
  tokenVersion: number;
  memberships: Array<{ projectId: string }>;
}

@Injectable()
export class AuthService {
  private readonly secret = process.env.AUTH_SECRET ?? "xunjianbao-local-secret";
  private readonly tokenLifetimeMs = 12 * 60 * 60 * 1000;

  private readonly passwordVerifier: PasswordVerifier;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject(PasswordVerifier) passwordVerifier?: PasswordVerifier,
  ) {
    this.passwordVerifier = passwordVerifier ?? new PasswordVerifier();
  }

  async login(input: LoginInput) {
    const account = input.username
      ? await this.database.userAccount.findUnique({
        where: { username: input.username },
        include: { memberships: { select: { projectId: true } } },
      })
      : null;

    const verificationHash = account && isScryptPasswordHash(account.passwordHash)
      ? account.passwordHash
      : DUMMY_PASSWORD_HASH;
    const passwordMatches = await this.passwordVerifier.verify(input.password ?? "", verificationHash);

    if (!account || account.status !== "active" || !this.isUserRole(account.role) || !passwordMatches) {
      throw new UnauthorizedException("Invalid username or password");
    }

    const identity = this.identityFor(account);
    const now = Date.now();
    await this.database.userAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date(now) },
    });

    return {
      token: this.sign({
        sub: account.id,
        ver: account.tokenVersion,
        iat: now,
        exp: now + this.tokenLifetimeMs,
      }),
      user: {
        username: account.username,
        name: identity.name,
        role: identity.role,
        projectIds: identity.projectIds,
      },
    };
  }

  async authenticateToken(token: string | undefined): Promise<AuthIdentity | null> {
    const payload = this.verifiedPayload(token);
    if (!payload || payload.exp <= Date.now()) return null;

    const account = await this.database.userAccount.findUnique({
      where: { id: payload.sub },
      include: { memberships: { select: { projectId: true } } },
    });
    if (
      !account
      || account.status !== "active"
      || account.tokenVersion !== payload.ver
      || !this.isUserRole(account.role)
    ) {
      return null;
    }

    return this.identityFor(account);
  }

  async projectsFor(identity: AuthIdentity): Promise<ProjectAccessItem[]> {
    const projects = await this.database.project.findMany({
      ...(identity.role === "member"
        ? { where: { memberships: { some: { userId: identity.id } } } }
        : {}),
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        shortName: true,
        customerType: true,
        archiveDimensions: true,
      },
    });

    return projects as ProjectAccessItem[];
  }

  private identityFor(account: AccountIdentitySource): AuthIdentity {
    if (!this.isUserRole(account.role)) throw new Error("Unsupported account role");
    return {
      id: account.id,
      sub: account.id,
      username: account.username,
      name: account.name,
      role: account.role,
      tokenVersion: account.tokenVersion,
      projectIds: account.memberships.map((membership) => membership.projectId),
    };
  }

  private verifiedPayload(token: string | undefined): SignedPayload | null {
    if (!token) return null;

    const [body, signature] = token.split(".");
    if (!body || !signature) return null;

    const expectedSignature = createHmac("sha256", this.secret).update(body).digest("base64url");
    if (!this.matches(signature, expectedSignature)) return null;

    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SignedPayload>;
      if (
        typeof payload.sub !== "string"
        || typeof payload.ver !== "number"
        || typeof payload.exp !== "number"
        || typeof payload.iat !== "number"
      ) return null;
      return payload as SignedPayload;
    } catch {
      return null;
    }
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

  private isUserRole(role: string): role is UserRole {
    return role === "platform_admin" || role === "member";
  }
}
