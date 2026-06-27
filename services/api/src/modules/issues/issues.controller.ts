import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { IssueStatus, Severity } from "@xunjianbao/shared";
import type { Response } from "express";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { AuditService } from "../audit/audit.service.js";
import { ok, paged } from "../../shared/api-response.js";
import { IssueWriteService } from "./issue-write.service.js";
import { IssueAttachmentService } from "./issue-attachment.service.js";
import { sendStoredFile } from "../../shared/file-download.js";

interface UploadedFileLike {
  filename: string;
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

const allowedStatuses: IssueStatus[] = ["pending", "processing", "rectified", "verified", "ignored", "archived"];

@Controller("issues")
export class IssuesController {
  constructor(
    @Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(IssueWriteService) private readonly issueWriteService: IssueWriteService,
    @Inject(IssueAttachmentService) private readonly attachmentService: IssueAttachmentService,
  ) {}

  @Get()
  async list(@Query() query: { keyword?: string; status?: IssueStatus; category?: string; page?: string; pageSize?: string }) {
    const status = query.status && allowedStatuses.includes(query.status) ? query.status : undefined;
    return ok(paged(await this.readRepository.issues({
      keyword: query.keyword,
      status,
      category: query.category,
    }), query));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.readRepository.issue(id);
    if (!item) throw new NotFoundException("Issue not found");
    return ok(item);
  }

  @Post()
  async create(@Body() body: { title?: string; category?: string; status?: IssueStatus; severity?: Severity; foundAt?: string; objectId?: string }) {
    return ok(await this.issueWriteService.create(body));
  }

  @Get(":id/attachments")
  async attachments(@Param("id") id: string) {
    return ok(paged(await this.attachmentService.list(id)));
  }

  @Post(":id/attachments")
  @UseInterceptors(FileInterceptor("file", {
    dest: "storage/issues/tmp",
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  async uploadAttachment(
    @Param("id") id: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() body: { attachmentType?: string; remark?: string },
  ) {
    return ok(await this.attachmentService.create(id, file, body));
  }

  @Get("attachments/:attachmentId/file")
  async attachmentFile(@Param("attachmentId") attachmentId: string, @Res() response: Response) {
    return sendStoredFile(response, await this.attachmentService.file(attachmentId));
  }

  @Patch(":id/status")
  async updateStatus(@Param("id") id: string, @Body() body: { status?: IssueStatus }) {
    if (!body.status || !allowedStatuses.includes(body.status)) {
      throw new BadRequestException("Invalid issue status");
    }

    const item = await this.readRepository.updateIssueStatus(id, body.status);
    if (!item) throw new NotFoundException("Issue not found");
    await this.auditService.record({
      action: "issue.status.update",
      targetType: "issue",
      targetId: id,
      summary: `问题「${item.title}」状态更新为 ${body.status}`,
    });
    return ok(item);
  }
}
