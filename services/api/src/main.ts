import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const port = Number(process.env.PORT ?? 3010);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix("api/v1");
  await app.listen(port, "127.0.0.1");
}

void bootstrap();
