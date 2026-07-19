import { Global, Module, type Provider } from "@nestjs/common";
import Redis from "ioredis";
import { ENV } from "../config/config.module.js";
import type { Env } from "@clip-lab/config";

export const REDIS = Symbol("REDIS");

const redisProvider: Provider = {
  provide: REDIS,
  inject: [ENV],
  useFactory: (env: Env): Redis => new Redis(env.REDIS_URL),
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [REDIS],
})
export class RedisModule {}
