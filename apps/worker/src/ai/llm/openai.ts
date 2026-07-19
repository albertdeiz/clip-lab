import OpenAI from "openai";
import type { LlmProvider, StructuredOptions, StructuredResult } from "./types.js";
import { costOf } from "./pricing.js";

/**
 * Provider compatible con la API de OpenAI. Con `baseURL` configurable sirve
 * para OpenAI, Groq, OpenRouter, Together, Fireworks, Ollama/vLLM y el endpoint
 * compatible de Gemini — solo cambiando OPENAI_BASE_URL y el modelo.
 * Salida estructurada vía `response_format: json_schema` (strict).
 */
export class OpenAiLlmProvider implements LlmProvider {
  readonly name = "openai";
  private readonly client: OpenAI;

  constructor(apiKey: string, baseURL: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async structured<T>(opts: StructuredOptions<T>): Promise<StructuredResult<T>> {
    const res = await this.client.chat.completions.create({
      model: opts.model,
      max_completion_tokens: opts.maxTokens ?? 1024,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: opts.schemaName,
          strict: true,
          schema: opts.jsonSchema,
        },
      },
    });

    const content = res.choices[0]?.message.content;
    if (!content) throw new Error("El modelo no devolvió contenido");
    const data = opts.validate(JSON.parse(content));
    const usage = {
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    };
    return { data, usage, costUsd: costOf(opts.model, usage) };
  }
}
