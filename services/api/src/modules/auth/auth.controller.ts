import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ok } from "../../shared/api-response.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: { username?: string; password?: string }) {
    return ok(this.authService.login(body));
  }
}
