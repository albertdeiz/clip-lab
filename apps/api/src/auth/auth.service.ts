import { randomBytes, createHash, randomUUID } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import type { RegisterInput, LoginInput } from "@clip-lab/contracts";
import type { Env } from "@clip-lab/config";
import { PrismaService } from "../prisma/prisma.service.js";
import { ENV } from "../config/config.module.js";

export interface IssuedTokens {
  accessToken: string;
  expiresInSec: number;
  /** Token opaco de refresh — el controlador lo pone en cookie httpOnly. */
  refreshToken: string;
  refreshExpiresInSec: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async issueTokens(
    userId: string,
    email: string,
    familyId: string,
  ): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      { expiresIn: this.env.ACCESS_TOKEN_TTL },
    );

    const refreshToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Date.now() + this.env.REFRESH_TOKEN_TTL * 1000,
    );
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        familyId,
        expiresAt,
      },
    });

    return {
      accessToken,
      expiresInSec: this.env.ACCESS_TOKEN_TTL,
      refreshToken,
      refreshExpiresInSec: this.env.REFRESH_TOKEN_TTL,
    };
  }

  async register(input: RegisterInput): Promise<IssuedTokens> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: "EMAIL_IN_USE",
        message: "Ya existe una cuenta con ese email",
      });
    }
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    const user = await this.prisma.user.create({
      data: { email, passwordHash },
    });
    return this.issueTokens(user.id, user.email, randomUUID());
  }

  async login(input: LoginInput): Promise<IssuedTokens> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const invalid = new UnauthorizedException({
      code: "INVALID_CREDENTIALS",
      message: "Email o contraseña incorrectos",
    });
    if (!user?.passwordHash) throw invalid;
    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) throw invalid;
    return this.issueTokens(user.id, user.email, randomUUID());
  }

  /**
   * Rotación con detección de reuso: si el token presentado ya fue rotado
   * (revocado) o no existe, se considera robo y se invalida toda la familia.
   */
  async refresh(rawToken: string | undefined): Promise<IssuedTokens> {
    const unauthorized = new UnauthorizedException({
      code: "INVALID_REFRESH_TOKEN",
      message: "Sesión inválida o expirada",
    });
    if (!rawToken) throw unauthorized;

    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!record) throw unauthorized;

    // Reuso de un token ya rotado → revocar toda la familia.
    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw unauthorized;
    }
    if (record.expiresAt.getTime() < Date.now()) throw unauthorized;

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
    });
    if (!user) throw unauthorized;

    // Rotar: revocar el actual y emitir uno nuevo en la misma familia.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(user.id, user.email, record.familyId);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (record) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async me(userId: string): Promise<{
    id: string;
    email: string;
    emailVerified: boolean;
    storageUsed: string;
    createdAt: string;
  }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      storageUsed: user.storageUsed.toString(),
      createdAt: user.createdAt.toISOString(),
    };
  }

  /** Upsert de cuenta desde OAuth (email verificado por el proveedor). */
  async upsertOAuthUser(
    provider: string,
    providerUserId: string,
    email: string,
  ): Promise<IssuedTokens> {
    const normalized = email.trim().toLowerCase();
    const account = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
    });

    let userId: string;
    let userEmail: string;
    if (account) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: account.userId },
      });
      userId = user.id;
      userEmail = user.email;
    } else {
      const user = await this.prisma.user.upsert({
        where: { email: normalized },
        create: {
          email: normalized,
          emailVerified: true,
          oauthAccounts: { create: { provider, providerUserId } },
        },
        update: {
          emailVerified: true,
          oauthAccounts: { create: { provider, providerUserId } },
        },
      });
      userId = user.id;
      userEmail = user.email;
    }
    return this.issueTokens(userId, userEmail, randomUUID());
  }
}
