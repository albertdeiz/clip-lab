import type { Env } from "@clip-lab/config";
import { NonRetryableError } from "../../errors.js";
import { resolveProvider } from "../registry.js";
import type { TranscriptionProvider } from "./types.js";
import { FasterWhisperProvider } from "./faster-whisper.js";
import { OpenAiTranscriptionProvider } from "./openai.js";

/**
 * Crea el proveedor de transcripción. 'faster-whisper' es local; cualquier otro
 * nombre se resuelve como endpoint compatible con OpenAI (`/audio/transcriptions`),
 * con presets conocidos u overrides por-proceso (TRANSCRIPTION_BASE_URL/API_KEY).
 */
export function createTranscriptionProvider(env: Env): TranscriptionProvider {
  const provider = env.TRANSCRIPTION_PROVIDER;
  if (provider === "faster-whisper") {
    return new FasterWhisperProvider(env.WHISPER_MODEL);
  }

  const r = resolveProvider(
    provider,
    { baseUrl: env.TRANSCRIPTION_BASE_URL, apiKey: env.TRANSCRIPTION_API_KEY },
    env,
  );
  if (r.kind !== "openai") {
    throw new NonRetryableError(
      `El proveedor de transcripción '${provider}' no expone una API de audio compatible`,
    );
  }
  if (!r.baseUrl) {
    throw new NonRetryableError(
      `Falta base URL para la transcripción con '${provider}' (define TRANSCRIPTION_BASE_URL)`,
    );
  }
  if (!r.apiKey) {
    throw new NonRetryableError(
      `Falta API key para la transcripción con '${provider}'`,
    );
  }
  return new OpenAiTranscriptionProvider(r.apiKey, r.baseUrl, env.TRANSCRIPTION_MODEL);
}
