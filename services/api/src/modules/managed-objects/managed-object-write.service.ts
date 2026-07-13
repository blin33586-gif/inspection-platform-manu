import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { ObjectType } from "@xunjianbao/shared";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { AuditService } from "../audit/audit.service.js";
import { currentProjectId, requireCurrentIdentity } from "../auth/project-context.js";

interface CreateManagedObjectInput {
  name?: string;
  status?: string;
  objectSubtype?: string;
  parentName?: string;
}

const allowedObjectTypes: ObjectType[] = ["community", "road", "point", "street"];
const idPrefixes: Record<ObjectType, string> = {
  community: "c",
  road: "r",
  point: "p",
  street: "s",
};

@Injectable()
export class ManagedObjectWriteService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async create(objectType: ObjectType, input: CreateManagedObjectInput) {
    const actor = requireCurrentIdentity().username;
    const projectId = currentProjectId();
    if (!allowedObjectTypes.includes(objectType)) throw new BadRequestException("Invalid object type");
    if (!input.name?.trim()) throw new BadRequestException("Object name is required");

    const object = await this.database.$transaction(async (transaction) => {
      const created = await transaction.managedObject.create({
        data: {
          projectId,
          id: `${idPrefixes[objectType]}-${randomUUID()}`,
          name: input.name!.trim(),
          objectType,
          objectSubtype: input.objectSubtype?.trim() || null,
          parentName: input.parentName?.trim() || null,
          status: input.status?.trim() || "待完善",
        },
      });
      await transaction.auditLog.create({
        data: {
          projectId, id: `audit-${randomUUID()}`, actor,
          action: "managedObject.create", targetType: objectType, targetId: created.id,
          summary: `新增${this.objectTypeLabel(objectType)}「${created.name}」`,
        },
      });
      return created;
    });

    if (objectType === "point") return this.readRepository.point(object.id);
    return this.readRepository.managedObject(object.id, objectType);
  }

  private objectTypeLabel(objectType: ObjectType) {
    if (objectType === "community") return "小区";
    if (objectType === "road") return "道路";
    if (objectType === "point") return "重点点位";
    return "街道";
  }
}
