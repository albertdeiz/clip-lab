import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@clip-lab/db";
import {
  EventType,
  ROUTING,
  type TranscriptGeneratedPayload,
  type HighlightsDetectedPayload,
} from "@clip-lab/contracts";
import { loadEnv } from "@clip-lab/config";
import type { PublishFn } from "../transcriber.js";
import { NonRetryableError } from "../errors.js";
import { createLlmProvider } from "../ai/llm/factory.js";
import { HighlightDetector } from "./detector.js";
import type { Word } from "./chunker.js";

const env = loadEnv();

/**
 * Detecta highlights para un video ya transcrito. Idempotente por videoId.
 * El proveedor y el modelo de cada etapa (local/global) se eligen por variables
 * de entorno; si falta la credencial, el job falla con motivo claro (no-retry).
 */
export async function detectHighlights(
  payload: TranscriptGeneratedPayload,
  publish: PublishFn,
): Promise<void> {
  const { videoId, userId } = payload;

  const existing = await prisma.highlightSet.findUnique({ where: { videoId } });
  if (existing?.status === "DONE") return; // idempotencia

  const transcript = await prisma.transcript.findUnique({ where: { videoId } });
  if (!transcript || transcript.status !== "DONE") {
    throw new NonRetryableError(
      "Transcript no disponible para detectar highlights",
    );
  }
  const words = (
    Array.isArray(transcript.words) ? transcript.words : []
  ) as unknown as Word[];

  await prisma.highlightSet.upsert({
    where: { videoId },
    create: { videoId, status: "DETECTING" },
    update: { status: "DETECTING", failReason: null },
  });

  try {
    const detector = new HighlightDetector(
      createLlmProvider(
        env.HIGHLIGHT_LOCAL_PROVIDER,
        { baseUrl: env.HIGHLIGHT_LOCAL_BASE_URL, apiKey: env.HIGHLIGHT_LOCAL_API_KEY },
        env,
      ),
      createLlmProvider(
        env.HIGHLIGHT_GLOBAL_PROVIDER,
        { baseUrl: env.HIGHLIGHT_GLOBAL_BASE_URL, apiKey: env.HIGHLIGHT_GLOBAL_API_KEY },
        env,
      ),
      {
        localModel: env.HIGHLIGHT_LOCAL_MODEL,
        globalModel: env.HIGHLIGHT_GLOBAL_MODEL,
        chunkSeconds: env.CHUNK_SECONDS,
        overlapSeconds: env.CHUNK_OVERLAP_SECONDS,
        target: env.HIGHLIGHTS_TARGET,
        minSec: env.HIGHLIGHT_MIN_SEC,
        maxSec: env.HIGHLIGHT_MAX_SEC,
        pauseSec: env.SENTENCE_PAUSE_SEC,
      },
    );
    const result = await detector.detect(words);

    await prisma.highlightSet.update({
      where: { videoId },
      data: {
        status: "DONE",
        model: result.globalModel,
        localModel: result.localModel,
        promptHash: result.promptHash,
        contentHash: transcript.contentHash,
        items: result.items as unknown as Prisma.InputJsonValue,
        costUsd: result.costUsd,
      },
    });

    const event: HighlightsDetectedPayload = {
      eventId: randomUUID(),
      type: EventType.HighlightsDetected,
      videoId,
      userId,
      count: result.items.length,
      costUsd: result.costUsd,
      occurredAt: new Date().toISOString(),
    };
    await publish(ROUTING.HighlightsDetected, event);
  } catch (err) {
    await prisma.highlightSet.update({
      where: { videoId },
      data: {
        status: "FAILED",
        failReason:
          err instanceof NonRetryableError
            ? err.message
            : "No se pudieron detectar highlights",
      },
    });
    throw err;
  }
}
