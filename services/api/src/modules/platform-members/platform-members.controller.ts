import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { ok } from "../../shared/api-response.js";
import type { AuthenticatedProjectRequest } from "../auth/auth.guard.js";
import {
  PlatformMembersService,
  type CreatePlatformMemberInput,
  type UpdatePlatformMemberInput,
} from "./platform-members.service.js";

@Controller("platform/members")
export class PlatformMembersController {
  constructor(@Inject(PlatformMembersService) private readonly members: PlatformMembersService) {}

  @Get()
  async list() {
    return ok(await this.members.list());
  }

  @Post()
  async create(@Body() body: CreatePlatformMemberInput, @Req() request: Request) {
    return ok(await this.members.create(body, this.actorId(request)));
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdatePlatformMemberInput,
    @Req() request: Request,
  ) {
    return ok(await this.members.update(id, body, this.actorId(request)));
  }

  @Post(":id/reset-password")
  async resetPassword(
    @Param("id") id: string,
    @Body() body: { password?: string },
    @Req() request: Request,
  ) {
    return ok(await this.members.resetPassword(id, body, this.actorId(request)));
  }

  private actorId(request: Request) {
    return (request as AuthenticatedProjectRequest).authIdentity?.id;
  }
}
