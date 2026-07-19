import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "rate_limit";

export interface RateLimitOptions {
  /** Máximo de solicitudes permitidas dentro de la ventana. */
  limit: number;
  /** Tamaño de la ventana en segundos. */
  windowSec: number;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
