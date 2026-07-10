import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { resolveRuntimeConfig } from "./config/runtime-config.js";

async function bootstrap() {
  const config = resolveRuntimeConfig(process.env);
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix("api/v1");
  await app.listen(config.port, config.host);
}

void bootstrap();
