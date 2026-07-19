import { Controller, Get, Inject } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  type HealthIndicatorResult,
} from "@nestjs/terminus";
import { ApiTags } from "@nestjs/swagger";
import Redis from "ioredis";
import { ENV } from "../config/config.module.js";
import type { Env } from "@clip-lab/config";
import { PrismaService } from "../prisma/prisma.service.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  private readonly redis: Redis;

  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.redis = new Redis(this.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  @Get("live")
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  @HealthCheck()
  ready() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        await this.prisma.$queryRaw`SELECT 1`;
        return { postgres: { status: "up" } };
      },
      async (): Promise<HealthIndicatorResult> => {
        if (this.redis.status !== "ready") await this.redis.connect();
        await this.redis.ping();
        return { redis: { status: "up" } };
      },
    ]);
  }
}
