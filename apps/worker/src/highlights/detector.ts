import { createHash } from "node:crypto";
import { z } from "zod";
import { buildSentences, snapRange } from "@clip-lab/contracts";
import type { LlmProvider } from "../ai/llm/types.js";
import {
  buildChunks,
  aggregate,
  mapLimit,
  type Word,
  type Candidate,
} from "./chunker.js";

const LOCAL_SYSTEM = `You are a viral content analyst for short vertical clips.
You receive a fragment of a video's transcript with its time range.
Identify 0 to 3 moments with viral potential that are SELF-CONTAINED: a complete
idea with a natural opening (hook or setup) and a closing (payoff, conclusion or
result). Do NOT cut in the middle of an idea or a sentence.
Start at the beginning of a sentence and end at the end of a sentence. Length 15-90s.
Return absolute times in seconds within the given range, a score 0-1, a hook and the reason.
Write the hook and reason in the same language as the transcript.`;

const GLOBAL_SYSTEM = `You are a senior viral-clip editor.
You receive candidate moments from a video (with times, local score, hook and reason).
Select and ORDER the best ones as final clips. Each clip must tell a COMPLETE,
self-standing idea: it starts at a natural opening and ends at a closing, with no
cut-off sentences. Adjust the boundaries to full sentences if needed.
Give each clip a catchy title (for social media) and a brief reason.
Write the title and reason in the same language as the transcript.
Return at most the requested number, from best to worst.`;

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

const localJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
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

const globalJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    highlights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
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
  minSec: number;
  maxSec: number;
  pauseSec: number;
}

/**
 * Detector jerárquico agnóstico de proveedor: recibe un LlmProvider por etapa
 * (local y global), configurables por variables de entorno.
 */
export class HighlightDetector {
  constructor(
    private readonly localLlm: LlmProvider,
    private readonly globalLlm: LlmProvider,
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

    // 1) Análisis local por chunk, en paralelo. Rúbrica cacheada (si el
    //    provider lo soporta).
    const perChunk = await mapLimit(chunks, 5, async (chunk) => {
      const { data, costUsd } = await this.localLlm.structured({
        model: this.opts.localModel,
        system: LOCAL_SYSTEM,
        user: `Fragment range: ${chunk.start.toFixed(1)}s to ${chunk.end.toFixed(1)}s.\n\nTranscript:\n${chunk.text}`,
        schemaName: "candidates",
        jsonSchema: localJsonSchema,
        validate: (d) => localSchema.parse(d),
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

    // 3) Rerank global + títulos (1 llamada). Contexto compacto.
    const compact = top
      .map(
        (c, i) =>
          `${i + 1}. [${c.start.toFixed(1)}-${c.end.toFixed(1)}s] score=${c.score.toFixed(2)} hook="${c.hook}" | ${c.reason}`,
      )
      .join("\n");
    const { data, costUsd } = await this.globalLlm.structured({
      model: this.opts.globalModel,
      system: GLOBAL_SYSTEM,
      user: `Choose the best ${this.opts.target} final clips from these candidates:\n\n${compact}`,
      schemaName: "highlights",
      jsonSchema: globalJsonSchema,
      validate: (d) => globalSchema.parse(d),
      maxTokens: 2048,
    });
    cost += costUsd;

    // Ajusta cada highlight a límites de frase (cortes coherentes, sin frases
    // partidas) y a la duración objetivo. Determinístico.
    const sentences = buildSentences(words, this.opts.pauseSec);
    const items = data.highlights
      .filter((h) => h.end > h.start)
      .slice(0, this.opts.target)
      .map((h) => {
        const snapped = snapRange(
          h.start,
          h.end,
          sentences,
          this.opts.minSec,
          this.opts.maxSec,
        );
        return { ...h, start: snapped.start, end: snapped.end };
      });

    return {
      items,
      costUsd: cost,
      localModel: this.opts.localModel,
      globalModel: this.opts.globalModel,
      promptHash: this.promptHash,
    };
  }
}
