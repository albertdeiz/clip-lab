import { createReadStream } from "node:fs";
import OpenAI from "openai";
import type { TranscriptionProvider, TranscriptionResult } from "./types.js";

/**
 * Transcripción vía API compatible con OpenAI (`/audio/transcriptions`).
 * Con `baseURL` sirve para OpenAI, Groq (whisper-large-v3), etc.
 * Usa verbose_json + timestamps word-level.
 */
export class OpenAiTranscriptionProvider implements TranscriptionProvider {
  readonly name = "openai";
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    baseURL: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  get modelLabel(): string {
    return `openai:${this.model}`;
  }

  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    const res = await this.client.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: this.model,
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });
    // `verbose_json` → TranscriptionVerbose { text, language, words? }
    const verbose = res as unknown as {
      text: string;
      language?: string;
      words?: Array<{ word: string; start: number; end: number }>;
    };
    return {
      language: verbose.language ?? null,
      text: verbose.text,
      words: (verbose.words ?? []).map((w) => ({
        w: w.word,
        start: w.start,
        end: w.end,
      })),
    };
  }
}
