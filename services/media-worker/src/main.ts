import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { JobRunner } from "./job-runner.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for media worker");

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000, max: 5 }),
});
const runner = new JobRunner(database, process.env.STORAGE_ROOT);
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
  });
}

await database.$connect();
try {
  while (!stopping) {
    const processed = await runner.processNext();
    if (!processed) await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
  }
} finally {
  await database.$disconnect();
}
