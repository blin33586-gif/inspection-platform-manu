import { Controller, Get } from "@nestjs/common";
import { ok } from "../../shared/api-response.js";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return ok({ status: "ok" });
  }
}
