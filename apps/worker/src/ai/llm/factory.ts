import type { Env } from "@clip-lab/config";
import { NonRetryableError } from "../../errors.js";
import { resolveProvider } from "../registry.js";
import type { LlmProvider } from "./types.js";
import { AnthropicLlmProvider } from "./anthropic.js";
import { OpenAiLlmProvider } from "./openai.js";

/**
 * Crea el provider LLM para un proceso a partir de su nombre de proveedor y los
 * overrides por-proceso (base URL / API key). Falla con NonRetryableError si
 * falta configuración (problema de config, no se reintenta).
 */
export function createLlmProvider(
  provider: string,
  overrides: { baseUrl?: string; apiKey?: string },
  env: Env,
): LlmProvider {
  const r = resolveProvider(provider, overrides, env);
  if (r.kind === "anthropic") {
    if (!r.apiKey) {
      throw new NonRetryableError(
        `Falta API key para el proveedor LLM '${provider}'`,
      );
    }
    return new AnthropicLlmProvider(r.apiKey, r.baseUrl);
  }
  // openai-compatible
  if (!r.baseUrl) {
    throw new NonRetryableError(
      `Falta base URL para el proveedor LLM '${provider}' (define <PROCESO>_BASE_URL o usa un preset conocido)`,
    );
  }
  if (!r.apiKey) {
    throw new NonRetryableError(
      `Falta API key para el proveedor LLM '${provider}'`,
    );
  }
  return new OpenAiLlmProvider(r.apiKey, r.baseUrl);
}
