import { Module } from "@nestjs/common";
import { PlatformMembersController } from "./platform-members.controller.js";
import { PlatformMembersService } from "./platform-members.service.js";

@Module({
  controllers: [PlatformMembersController],
  providers: [PlatformMembersService],
})
export class PlatformMembersModule {}
