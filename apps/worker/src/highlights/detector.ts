import { createHash } from "node:crypto";
import { z } from "zod";
import { AnthropicClient } from "./anthropic.js";
import {
  buildChunks,
  aggregate,
  mapLimit,
  type Word,
  type Candidate,
} from "./chunker.js";

const LOCAL_SYSTEM = `Eres un analista de contenido viral para clips cortos verticales.
Recibes un fragmento de la transcripción de un video, con su rango de tiempo.
Identifica de 0 a 3 momentos con mayor potencial viral dentro del fragmento.
Un buen momento es auto-contenido (20-90s), tiene un gancho claro y genera curiosidad, emoción o valor.
Devuelve tiempos absolutos en segundos dentro del rango dado, un score 0-1, un hook corto y la razón.`;

const GLOBAL_SYSTEM = `Eres un editor senior de clips virales.
Recibes momentos candidatos de un video (con tiempos, score local, hook y razón).
Selecciona y ORDENA los mejores como clips finales, ajustando límites si conviene.
Cada clip debe tener un título atractivo (para redes) y una razón breve.
Devuelve como máximo el número pedido, del mejor al peor.`;

const localSchema = z.object({
  candidates: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      score: z.number(),
      hook: z.string(),
      reason: z.string(),
    }),
  ),
});

const localInputSchema = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: { type: "number" },
          end: { type: "number" },
          score: { type: "number" },
          hook: { type: "string" },
          reason: { type: "string" },
        },
        required: ["start", "end", "score", "hook", "reason"],
      },
    },
  },
  required: ["candidates"],
} as const;

const globalSchema = z.object({
  highlights: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      score: z.number(),
      title: z.string(),
      reason: z.string(),
    }),
  ),
});

const globalInputSchema = {
  type: "object",
  properties: {
    highlights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: { type: "number" },
          end: { type: "number" },
          score: { type: "number" },
          title: { type: "string" },
          reason: { type: "string" },
        },
        required: ["start", "end", "score", "title", "reason"],
      },
    },
  },
  required: ["highlights"],
} as const;

export interface HighlightItem {
  start: number;
  end: number;
  score: number;
  title: string;
  reason: string;
}

export interface DetectionResult {
  items: HighlightItem[];
  costUsd: number;
  localModel: string;
  globalModel: string;
  promptHash: string;
}

export interface DetectorOptions {
  localModel: string;
  globalModel: string;
  chunkSeconds: number;
  overlapSeconds: number;
  target: number;
}

export class HighlightDetector {
  constructor(
    private readonly llm: AnthropicClient,
    private readonly opts: DetectorOptions,
  ) {}

  get promptHash(): string {
    return createHash("sha256")
      .update(`${LOCAL_SYSTEM}\n${GLOBAL_SYSTEM}\n${this.opts.target}`)
      .digest("hex")
      .slice(0, 16);
  }

  async detect(words: Word[]): Promise<DetectionResult> {
    const chunks = buildChunks(
      words,
      this.opts.chunkSeconds,
      this.opts.overlapSeconds,
    );
    let cost = 0;

    // 1) Análisis local por chunk, en paralelo (Haiku). Rúbrica cacheada.
    const perChunk = await mapLimit(chunks, 5, async (chunk) => {
      const { data, costUsd } = await this.llm.structured({
        model: this.opts.localModel,
        system: LOCAL_SYSTEM,
        user: `Rango del fragmento: ${chunk.start.toFixed(1)}s a ${chunk.end.toFixed(1)}s.\n\nTranscripción:\n${chunk.text}`,
        toolName: "reportar_candidatos",
        inputSchema: localInputSchema,
        validate: localSchema,
        maxTokens: 1024,
        cacheSystem: true,
      });
      cost += costUsd;
      return data.candidates;
    });

    // 2) Agregación + dedup (algoritmo, sin IA).
    const candidates: Candidate[] = perChunk.flat();
    const top = aggregate(candidates, Math.max(this.opts.target * 2, 12));

    if (top.length === 0) {
      return {
        items: [],
        costUsd: cost,
        localModel: this.opts.localModel,
        globalModel: this.opts.globalModel,
        promptHash: this.promptHash,
      };
    }

    // 3) Rerank global + títulos (Sonnet, 1 llamada). Contexto compacto.
    const compact = top
      .map(
        (c, i) =>
          `${i + 1}. [${c.start.toFixed(1)}-${c.end.toFixed(1)}s] score=${c.score.toFixed(2)} hook="${c.hook}" | ${c.reason}`,
      )
      .join("\n");
    const { data, costUsd } = await this.llm.structured({
      model: this.opts.globalModel,
      system: GLOBAL_SYSTEM,
      user: `Elige los mejores ${this.opts.target} clips finales de estos candidatos:\n\n${compact}`,
      toolName: "reportar_highlights",
      inputSchema: globalInputSchema,
      validate: globalSchema,
      maxTokens: 2048,
    });
    cost += costUsd;

    const items = data.highlights
      .filter((h) => h.end > h.start)
      .slice(0, this.opts.target);

    return {
      items,
      costUsd: cost,
      localModel: this.opts.localModel,
      globalModel: this.opts.globalModel,
      promptHash: this.promptHash,
    };
  }
}
