import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { AccountBootstrapService } from "./account-bootstrap.service.js";
import { ProjectContextInterceptor } from "./project-context.interceptor.js";
import { PasswordVerifier } from "./password-hash.js";

@Module({
  controllers: [AuthController],
  providers: [
    AccountBootstrapService,
    PasswordVerifier,
    AuthService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ProjectContextInterceptor,
    },
  ],
})
export class AuthModule {}
