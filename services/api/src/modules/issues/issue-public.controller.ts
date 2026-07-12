import { Controller, Get, Inject, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { ok } from "../../shared/api-response.js";
import { sendInlineStoredFile, sendStoredFile } from "../../shared/file-download.js";
import { IssuePublicReadService } from "./issue-public-read.service.js";

@Controller("public/issues")
export class IssuePublicController {
  constructor(@Inject(IssuePublicReadService) private readonly reader: IssuePublicReadService) {}
  @Get(":token") async issue(@Param("token") token: string) { return ok(await this.reader.issue(token)); }
  @Get(":token/evidence") async evidence(@Param("token") token: string, @Res() response: Response) { return sendInlineStoredFile(response, await this.reader.evidence(token)); }
  @Get(":token/card.png") async card(@Param("token") token: string, @Res() response: Response) { return sendInlineStoredFile(response, await this.reader.card(token)); }
  @Get(":token/card-download.png") async downloadCard(@Param("token") token: string, @Res() response: Response) { return sendStoredFile(response, await this.reader.card(token)); }
}
