import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthUser } from "../guards/jwt-auth.guard.js";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { user: AuthUser }>();
    return req.user;
  },
);
