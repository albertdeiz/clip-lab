import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";

/** Precios USD por 1M de tokens (input/output). Fuente: catálogo de modelos. */
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
};

export function costOf(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
): number {
  const p = PRICING[model] ?? { in: 3, out: 15 };
  return (usage.input_tokens * p.in + usage.output_tokens * p.out) / 1_000_000;
}

export interface LlmResult<T> {
  data: T;
  costUsd: number;
}

export class AnthropicClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Salida estructurada vía tool use forzado (estable en cualquier versión del
   * SDK) validada con Zod. `cacheSystem` cachea el prefijo estable (rúbrica)
   * para abaratar el fan-out por chunk (~0.1x en lecturas).
   */
  async structured<T>(opts: {
    model: string;
    system: string;
    user: string;
    toolName: string;
    inputSchema: Record<string, unknown>;
    validate: ZodType<T>;
    maxTokens?: number;
    cacheSystem?: boolean;
  }): Promise<LlmResult<T>> {
    const res = await this.client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      system: [
        {
          type: "text",
          text: opts.system,
          ...(opts.cacheSystem
            ? { cache_control: { type: "ephemeral" as const } }
            : {}),
        },
      ],
      messages: [{ role: "user", content: opts.user }],
      tools: [
        {
          name: opts.toolName,
          description: "Devuelve el resultado estructurado.",
          input_schema: opts.inputSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: opts.toolName },
    });

    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("El modelo no invocó la herramienta esperada");
    }
    const data = opts.validate.parse(block.input);
    return { data, costUsd: costOf(opts.model, res.usage) };
  }
}
