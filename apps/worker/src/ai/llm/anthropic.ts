import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, StructuredOptions, StructuredResult } from "./types.js";
import { costOf } from "./pricing.js";

/** Provider nativo de Anthropic (salida estructurada vía tool use forzado). */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async structured<T>(opts: StructuredOptions<T>): Promise<StructuredResult<T>> {
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
          name: opts.schemaName,
          description: "Return the structured result.",
          input_schema: opts.jsonSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: opts.schemaName },
    });

    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("El modelo no invocó la herramienta esperada");
    }
    const data = opts.validate(block.input);
    const usage = {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
    return { data, usage, costUsd: costOf(opts.model, usage) };
  }
}
