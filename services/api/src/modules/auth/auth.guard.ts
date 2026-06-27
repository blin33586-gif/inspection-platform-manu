import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method === "OPTIONS" || request.path === "/api/v1/auth/login") return true;

    const token = this.tokenFromRequest(request);
    if (this.authService.verifyToken(token)) return true;

    throw new UnauthorizedException("Unauthorized");
  }

  private tokenFromRequest(request: Request) {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length);

    const token = request.query.token;
    return typeof token === "string" ? token : undefined;
  }
}
