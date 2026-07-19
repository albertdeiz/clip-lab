import { randomUUID } from "node:crypto";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Res,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  registerSchema,
  loginSchema,
  type RegisterInput,
  type LoginInput,
  type AuthTokens,
} from "@clip-lab/contracts";
import type { Env } from "@clip-lab/config";
import { ENV } from "../config/config.module.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AuthService, type IssuedTokens } from "./auth.service.js";
import { GoogleService } from "./google.service.js";
import { JwtAuthGuard, type AuthUser } from "./guards/jwt-auth.guard.js";
import { RateLimitGuard } from "./guards/rate-limit.guard.js";
import { RateLimit } from "./decorators/rate-limit.decorator.js";
import { CurrentUser } from "./decorators/current-user.decorator.js";

const REFRESH_COOKIE = "clip_rt";
const REFRESH_COOKIE_PATH = "/auth";

@ApiTags("auth")
@Controller("auth")
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private setRefreshCookie(reply: FastifyReply, tokens: IssuedTokens): void {
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.env.NODE_ENV === "production",
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      maxAge: tokens.refreshExpiresInSec,
    });
  }

  private clearRefreshCookie(reply: FastifyReply): void {
    reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  private toAuthTokens(tokens: IssuedTokens): AuthTokens {
    return { accessToken: tokens.accessToken, expiresInSec: tokens.expiresInSec };
  }

  @Post("register")
  @HttpCode(201)
  @RateLimit({ limit: 10, windowSec: 60 })
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(
    @Body() body: RegisterInput,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthTokens> {
    const tokens = await this.auth.register(body);
    this.setRefreshCookie(reply, tokens);
    return this.toAuthTokens(tokens);
  }

  @Post("login")
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSec: 60 })
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: LoginInput,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthTokens> {
    const tokens = await this.auth.login(body);
    this.setRefreshCookie(reply, tokens);
    return this.toAuthTokens(tokens);
  }

  @Post("refresh")
  @HttpCode(200)
  @RateLimit({ limit: 60, windowSec: 60 })
  async refresh(
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthTokens> {
    const req = reply.request as FastifyRequest;
    const raw = req.cookies?.[REFRESH_COOKIE];
    const tokens = await this.auth.refresh(raw);
    this.setRefreshCookie(reply, tokens);
    return this.toAuthTokens(tokens);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const req = reply.request as FastifyRequest;
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    this.clearRefreshCookie(reply);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  // --- Google OAuth ---
  @Get("oauth/google")
  googleStart(@Res({ passthrough: true }) reply: FastifyReply): void {
    const state = randomUUID();
    reply.setCookie("clip_oauth_state", state, {
      httpOnly: true,
      secure: this.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth",
      maxAge: 600,
    });
    void reply.redirect(this.google.buildAuthUrl(state));
  }

  @Get("oauth/google/callback")
  async googleCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const req = reply.request as FastifyRequest;
    const expectedState = req.cookies?.["clip_oauth_state"];
    if (!code || !state || state !== expectedState) {
      void reply.redirect(`${this.env.FRONTEND_ORIGIN}/login?error=oauth_state`);
      return;
    }
    const profile = await this.google.exchangeCode(code);
    if (!profile.emailVerified) {
      void reply.redirect(
        `${this.env.FRONTEND_ORIGIN}/login?error=email_unverified`,
      );
      return;
    }
    const tokens = await this.auth.upsertOAuthUser(
      "google",
      profile.providerUserId,
      profile.email,
    );
    this.setRefreshCookie(reply, tokens);
    reply.clearCookie("clip_oauth_state", { path: "/auth" });
    // El frontend llama a /auth/refresh tras el redirect para obtener el access token.
    void reply.redirect(`${this.env.FRONTEND_ORIGIN}/auth/callback`);
  }
}
