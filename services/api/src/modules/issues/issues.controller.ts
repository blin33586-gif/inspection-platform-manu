import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { issues } from "../../shared/mock-data.js";
import { ok, page } from "../../shared/api-response.js";

@Controller("issues")
export class IssuesController {
  @Get()
  list() {
    return ok(page(issues));
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    const item = issues.find((issue) => issue.id === id);
    if (!item) throw new NotFoundException("Issue not found");
    return ok(item);
  }
}
