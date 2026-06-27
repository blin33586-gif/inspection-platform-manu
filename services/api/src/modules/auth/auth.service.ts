import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

interface LoginInput {
  username?: string;
  password?: string;
}

@Injectable()
export class AuthService {
  private readonly username = process.env.ADMIN_USERNAME ?? "admin";
  private readonly password = process.env.ADMIN_PASSWORD ?? "xunjianbao2026";
  private readonly secret = process.env.AUTH_SECRET ?? "xunjianbao-local-secret";

  login(input: LoginInput) {
    if (!this.matches(input.username ?? "", this.username) || !this.matches(input.password ?? "", this.password)) {
      throw new UnauthorizedException("Invalid username or password");
    }

    const payload = {
      sub: this.username,
      name: "曲阳路街道管理员",
      role: "admin",
      iat: Date.now(),
    };

    return {
      token: this.sign(payload),
      user: {
        username: this.username,
        name: payload.name,
        role: payload.role,
      },
    };
  }

  private sign(payload: Record<string, unknown>) {
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
