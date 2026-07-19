import type { TokenUsage } from "./types.js";

/**
 * Precios USD por 1M de tokens (input/output). Mejor esfuerzo: si el modelo no
 * está en la tabla, el costo se registra como 0 (no rompe el flujo).
 */
const PRICING: Record<string, { in: number; out: number }> = {
  // Anthropic
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
  // OpenAI (referencia; ajústalo a tu proveedor/tarifa)
  "gpt-5": { in: 1.25, out: 10 },
  "gpt-5-mini": { in: 0.25, out: 2 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
};

export function costOf(model: string, usage: TokenUsage): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (usage.inputTokens * p.in + usage.outputTokens * p.out) / 1_000_000;
}
