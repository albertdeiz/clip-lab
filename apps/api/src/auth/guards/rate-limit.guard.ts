import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import Redis from "ioredis";
import { REDIS } from "../../common/redis.module.js";
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from "../decorators/rate-limit.decorator.js";

/**
 * Rate limiting distribuido con Redis (INCR + EXPIRE). Multi-instancia seguro.
 * Se activa solo en rutas anotadas con @RateLimit.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const ip = req.ip;
    const route = `${req.method}:${req.routeOptions?.url ?? req.url}`;
    const key = `rl:${route}:${ip}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, options.windowSec);
    }

    if (count > options.limit) {
      const ttl = await this.redis.ttl(key);
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          message: `Demasiadas solicitudes. Reintenta en ${ttl}s.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
