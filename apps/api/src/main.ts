import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import { loadEnv } from "@clip-lab/config";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv(); // valida el entorno; falla rápido si algo falta

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.register(helmet);
  await app.register(cors, {
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle("ClipLab API")
    .setDescription("API de ingesta y procesamiento de video")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  app.get(Logger).log(`API escuchando en http://localhost:${env.API_PORT}`);
}

void bootstrap();
