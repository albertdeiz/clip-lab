import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Env } from "@clip-lab/config";
import { ENV } from "../config/config.module.js";

export interface GoogleProfile {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
}

/**
 * Flujo OAuth 2.0 Authorization Code de Google. Implementación real; si no hay
 * credenciales configuradas devuelve 503 (config ausente, no un stub).
 */
@Injectable()
export class GoogleService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  get configured(): boolean {
    return Boolean(
      this.env.GOOGLE_OAUTH_CLIENT_ID && this.env.GOOGLE_OAUTH_CLIENT_SECRET,
    );
  }

  private ensureConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException({
        code: "OAUTH_NOT_CONFIGURED",
        message: "Google OAuth no está configurado en este entorno",
      });
    }
  }

  private get redirectUri(): string {
    const base = (
      process.env.API_PUBLIC_URL ?? `http://localhost:${this.env.API_PORT}`
    ).replace(/\/$/, "");
    return `${base}/auth/oauth/google/callback`;
  }

  buildAuthUrl(state: string): string {
    this.ensureConfigured();
    const params = new URLSearchParams({
      client_id: this.env.GOOGLE_OAUTH_CLIENT_ID as string,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleProfile> {
    this.ensureConfigured();
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.env.GOOGLE_OAUTH_CLIENT_ID as string,
        client_secret: this.env.GOOGLE_OAUTH_CLIENT_SECRET as string,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      throw new ServiceUnavailableException({
        code: "OAUTH_EXCHANGE_FAILED",
        message: "No se pudo intercambiar el código de Google",
      });
    }
    const { access_token } = (await tokenRes.json()) as {
      access_token: string;
    };

    const infoRes = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { authorization: `Bearer ${access_token}` } },
    );
    if (!infoRes.ok) {
      throw new ServiceUnavailableException({
        code: "OAUTH_USERINFO_FAILED",
        message: "No se pudo obtener el perfil de Google",
      });
    }
    const info = (await infoRes.json()) as {
      sub: string;
      email: string;
      email_verified: boolean;
    };
    return {
      providerUserId: info.sub,
      email: info.email,
      emailVerified: info.email_verified,
    };
  }
}
