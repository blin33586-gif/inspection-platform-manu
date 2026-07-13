import { Body, Controller, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { ok } from "../../shared/api-response.js";
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
  async create(@Body() body: CreatePlatformMemberInput) {
    return ok(await this.members.create(body));
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdatePlatformMemberInput,
  ) {
    return ok(await this.members.update(id, body));
  }

  @Post(":id/reset-password")
  async resetPassword(
    @Param("id") id: string,
    @Body() body: { password?: string },
  ) {
    return ok(await this.members.resetPassword(id, body));
  }
}
