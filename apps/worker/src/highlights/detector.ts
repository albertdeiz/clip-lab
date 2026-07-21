import { createHash } from "node:crypto";
import { z } from "zod";
import { buildSentences, snapRange, type Sentence } from "@clip-lab/contracts";
import type { LlmProvider } from "../ai/llm/types.js";
import { mapLimit, type Word } from "./chunker.js";

/**
 * Detección de momentos en UNA sola pasada sobre el transcript completo: el
 * modelo estudia todo el video y devuelve "líneas de pensamiento" completas
 * (ideas auto-contenidas, alineadas a frases, opcionalmente multi-segmento).
 * Para videos muy largos que exceden el presupuesto de tokens, cae a un
 * seccionado semántico (cortes por pausa, no por tiempo fijo) analizado por
 * secciones y fusionado de forma determinística.
 */

// Presupuesto de entrada para una sola pasada (~chars; ~4 chars/token).
const SINGLE_PASS_CHAR_BUDGET = 240_000; // ≈ 60k tokens (varias horas de habla)

const momentSchema = z.object({
  moments: z.array(
    z.object({
      segments: z
        .array(z.object({ start: z.number(), end: z.number() }))
        .min(1),
      score: z.number(),
      title: z.string(),
      reason: z.string(),
      summary: z.boolean().optional(),
    }),
  ),
});

const momentJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    moments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          segments: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                start: { type: "number" },
                end: { type: "number" },
              },
              required: ["start", "end"],
            },
          },
          score: { type: "number" },
          title: { type: "string" },
          reason: { type: "string" },
          summary: { type: "boolean" },
        },
        required: ["segments", "score", "title", "reason"],
      },
    },
  },
  required: ["moments"],
} as const;

export interface HighlightItem {
  start: number;
  end: number;
  score: number;
  title: string;
  reason: string;
  segments?: { start: number; end: number }[];
  summary?: boolean;
}

export interface DetectionResult {
  items: HighlightItem[];
  costUsd: number;
  localModel: string | null;
  globalModel: string;
  promptHash: string;
}

export interface DetectorOptions {
  model: string; // modelo de la pasada principal
  sectionModel: string; // modelo por sección (fallback de videos largos)
  target: number;
  minSec: number;
  maxSec: number;
  pauseSec: number;
  granularity: "few-long" | "balanced" | "many-short";
  style: "balanced" | "educational" | "viral-hooks" | "quotes";
  titleLanguage: string; // auto | es | en | …
  allowMultiSegment: boolean;
  includeSummary: boolean;
}

const STYLE_HINT: Record<DetectorOptions["style"], string> = {
  balanced: "overall viral/engagement potential",
  educational: "clear, self-explanatory teaching value",
  "viral-hooks": "strong hooks and shareable, surprising payoffs",
  quotes: "memorable, quotable standalone statements",
};

const GRANULARITY_HINT: Record<DetectorOptions["granularity"], string> = {
  "few-long": "Prefer fewer, longer, fully-developed ideas.",
  balanced: "",
  "many-short": "Prefer more, shorter, punchy moments.",
};

function langHint(lang: string): string {
  if (lang === "auto") return "in the same language as the transcript";
  return `in ${lang}`;
}

function buildSystem(o: DetectorOptions): string {
  const multi = o.allowMultiSegment
    ? "A line of thought may be a single contiguous span OR assembled from several non-contiguous parts (its `segments`) that together form ONE coherent idea."
    : "Each line of thought must be a single contiguous span (one segment).";
  const summary = o.includeSummary
    ? "\n- Also add ONE extra moment that is an overall recap of the whole video, assembled from its key parts, with summary=true."
    : "";
  return `You are a senior short-form video editor. You receive the FULL transcript of a video as timestamped sentences ("[start-end] text").
Identify the best ${o.target} self-contained "lines of thought": each a COMPLETE idea with a natural opening (hook/setup) and a closing (payoff/conclusion), ranked by ${STYLE_HINT[o.style]}.
${multi}
Rules:
- Start and end on sentence boundaries; never cut mid-idea or mid-sentence.
- Each moment lasts about ${o.minSec}-${o.maxSec}s in total.
- ${GRANULARITY_HINT[o.granularity]} Return at most ${o.target} moments, best first.
- Give each a catchy social title and a brief reason, ${langHint(o.titleLanguage)}.${summary}
Return absolute times in seconds, and a score 0-1.`;
}

function renderSentences(sentences: Sentence[]): string {
  return sentences
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join("\n");
}

/** Alinea un segmento a límites de frase sin forzar duración (para tramos). */
function alignSegment(
  start: number,
  end: number,
  sentences: Sentence[],
): { start: number; end: number } {
  return snapRange(start, end, sentences, 0.1, Number.MAX_SAFE_INTEGER);
}

export class HighlightDetector {
  constructor(
    private readonly primaryLlm: LlmProvider,
    private readonly sectionLlm: LlmProvider,
    private readonly opts: DetectorOptions,
  ) {}

  get promptHash(): string {
    return createHash("sha256")
      .update(
        `${buildSystem(this.opts)}\n${this.opts.target}\n${this.opts.granularity}\n${this.opts.style}\n${this.opts.allowMultiSegment}\n${this.opts.includeSummary}`,
      )
      .digest("hex")
      .slice(0, 16);
  }

  async detect(words: Word[]): Promise<DetectionResult> {
    const sentences = buildSentences(
      words as unknown as Parameters<typeof buildSentences>[0],
      this.opts.pauseSec,
    );
    if (sentences.length === 0) {
      return {
        items: [],
        costUsd: 0,
        localModel: null,
        globalModel: this.opts.model,
        promptHash: this.promptHash,
      };
    }

    const totalChars = sentences.reduce((a, s) => a + s.text.length, 0);

    if (totalChars <= SINGLE_PASS_CHAR_BUDGET) {
      // --- Camino por defecto: una sola pasada sobre todo el transcript. ---
      const { raw, cost } = await this.analyze(
        this.primaryLlm,
        this.opts.model,
        sentences,
        this.opts.target,
      );
      return {
        items: this.postProcess(raw, sentences).slice(
          0,
          this.opts.target + (this.opts.includeSummary ? 1 : 0),
        ),
        costUsd: cost,
        localModel: null,
        globalModel: this.opts.model,
        promptHash: this.promptHash,
      };
    }

    // --- Fallback (videos largos): seccionado semántico + fusión. ---
    const sections = sectionize(sentences, SINGLE_PASS_CHAR_BUDGET);
    let cost = 0;
    const perSection = await mapLimit(sections, 4, async (sec) => {
      const { raw, cost: c } = await this.analyze(
        this.sectionLlm,
        this.opts.sectionModel,
        sec,
        Math.max(2, Math.ceil(this.opts.target / sections.length) + 1),
      );
      cost += c;
      return this.postProcess(raw, sec);
    });
    const merged = dedupeByEnvelope(perSection.flat())
      .sort((a, b) => b.score - a.score)
      .slice(0, this.opts.target + (this.opts.includeSummary ? 1 : 0));
    return {
      items: merged,
      costUsd: cost,
      localModel: this.opts.sectionModel,
      globalModel: this.opts.model,
      promptHash: this.promptHash,
    };
  }

  /** Una llamada estructurada sobre un conjunto de frases. */
  private async analyze(
    llm: LlmProvider,
    model: string,
    sentences: Sentence[],
    target: number,
  ): Promise<{ raw: z.infer<typeof momentSchema>["moments"]; cost: number }> {
    const { data, costUsd } = await llm.structured({
      model,
      system: buildSystem({ ...this.opts, target }),
      user: `Transcript (timestamped sentences):\n\n${renderSentences(sentences)}`,
      schemaName: "moments",
      jsonSchema: momentJsonSchema,
      validate: (d) => momentSchema.parse(d),
      maxTokens: 4096,
      cacheSystem: true,
    });
    return { raw: data.moments, cost: costUsd };
  }

  /** Snap a frases, enforcement de duración y forma de HighlightItem. */
  private postProcess(
    moments: z.infer<typeof momentSchema>["moments"],
    sentences: Sentence[],
  ): HighlightItem[] {
    const items: HighlightItem[] = [];
    for (const m of moments) {
      let segs = m.segments.filter((s) => s.end > s.start);
      if (segs.length === 0) continue;
      if (!this.opts.allowMultiSegment) segs = [segs[0]!];

      const snapped =
        segs.length === 1
          ? [
              snapRange(
                segs[0]!.start,
                segs[0]!.end,
                sentences,
                this.opts.minSec,
                this.opts.maxSec,
              ),
            ]
          : segs.map((s) => alignSegment(s.start, s.end, sentences));

      const start = Math.min(...snapped.map((s) => s.start));
      const end = Math.max(...snapped.map((s) => s.end));
      if (end <= start) continue;
      items.push({
        start,
        end,
        score: m.score,
        title: m.title,
        reason: m.reason,
        ...(snapped.length > 1 ? { segments: snapped } : {}),
        ...(m.summary ? { summary: true } : {}),
      });
    }
    return dedupeByEnvelope(items).sort((a, b) => b.score - a.score);
  }
}

/** Elimina items con la misma envolvente (redondeada), conservando el mejor. */
function dedupeByEnvelope(items: HighlightItem[]): HighlightItem[] {
  const seen = new Set<string>();
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const out: HighlightItem[] = [];
  for (const it of sorted) {
    const key = `${Math.round(it.start)}-${Math.round(it.end)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/**
 * Divide las frases en secciones bajo `maxChars`, cortando en la pausa más
 * larga cercana al límite (no por tiempo fijo) para no partir ideas.
 */
export function sectionize(
  sentences: Sentence[],
  maxChars: number,
): Sentence[][] {
  const sections: Sentence[][] = [];
  let cur: Sentence[] = [];
  let chars = 0;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]!;
    cur.push(s);
    chars += s.text.length;
    const next = sentences[i + 1];
    const gap = next ? next.start - s.end : 0;
    // Corta si excedimos el presupuesto y hay una pausa apreciable, o al final.
    if (chars >= maxChars && (!next || gap > 0.5)) {
      sections.push(cur);
      cur = [];
      chars = 0;
    }
  }
  if (cur.length > 0) sections.push(cur);
  return sections;
}
