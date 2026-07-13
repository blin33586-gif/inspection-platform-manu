import { Body, Controller, Get, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { ok } from "../../shared/api-response.js";
import type { AuthenticatedProjectRequest } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  async login(@Body() body: { username?: string; password?: string }) {
    return ok(await this.authService.login(body));
  }

  @Get("projects")
  async projects(@Req() request: Request) {
    const identity = (request as AuthenticatedProjectRequest).authIdentity;
    return ok(identity ? await this.authService.projectsFor(identity) : []);
  }
}
