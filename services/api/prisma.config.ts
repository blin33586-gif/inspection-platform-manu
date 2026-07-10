import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./src/database/database-url.js";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: resolveDatabaseUrl(process.env),
  },
});
