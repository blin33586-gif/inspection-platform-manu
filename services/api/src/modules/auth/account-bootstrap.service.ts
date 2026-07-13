import { Inject, Injectable, Optional, type OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { seedLegacyAccounts } from "../../../prisma/seed-accounts.js";

@Injectable()
export class AccountBootstrapService implements OnModuleInit {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject("ACCOUNT_BOOTSTRAP_ENV") private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async onModuleInit() {
    await seedLegacyAccounts(this.database, this.env);
  }
}
