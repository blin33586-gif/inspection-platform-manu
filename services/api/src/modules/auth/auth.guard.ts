import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService, type AuthIdentity } from "./auth.service.js";

export type AuthenticatedProjectRequest = Request & {
  authIdentity?: AuthIdentity;
  projectId?: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedProjectRequest>();
    if (this.isPublicRequest(request)) return true;

    const identity = this.authService.verifyToken(this.tokenFromRequest(request));
    if (!identity) throw new UnauthorizedException("Unauthorized");
    request.authIdentity = identity;

    if (request.path === "/api/v1/auth/projects") return true;

    const projectIdHeader = request.headers["x-project-id"];
    const headerProjectId = Array.isArray(projectIdHeader) ? projectIdHeader[0] : projectIdHeader;
    const queryProjectId = typeof request.query.projectId === "string" ? request.query.projectId : undefined;
    const projectId = headerProjectId ?? queryProjectId;
    if (!projectId) throw new BadRequestException("Project selection required");
    if (!identity.projectIds.includes(projectId)) throw new ForbiddenException("Project access denied");
    request.projectId = projectId;

    if (identity.role === "member" && !["GET", "HEAD"].includes(request.method)) {
      throw new ForbiddenException("Read-only member cannot modify project data");
    }

    return true;
  }

  private isPublicRequest(request: Request) {
    return request.method === "OPTIONS"
      || request.path === "/api/v1/auth/login"
      || request.path === "/api/v1/health"
      || request.path.startsWith("/api/v1/public/issues/");
  }

  private tokenFromRequest(request: Request) {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length);

    const token = request.query.token;
    return typeof token === "string" ? token : undefined;
  }
}
