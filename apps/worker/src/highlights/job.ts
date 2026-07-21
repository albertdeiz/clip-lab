import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@clip-lab/db";
import {
  EventType,
  ROUTING,
  type HighlightsRequestedPayload,
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
 * Genera los momentos de un video ya transcrito, on-demand y con parámetros
 * (`config` viaja en el evento HighlightsRequested). El proveedor y el modelo de
 * cada etapa se eligen server-side por variables de entorno; si falta la
 * credencial, el job falla con motivo claro (no-retry).
 */
export async function detectHighlights(
  payload: HighlightsRequestedPayload,
  publish: PublishFn,
): Promise<void> {
  const { videoId, userId, config } = payload;

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
      // primary (una pasada) = proveedor global
      createLlmProvider(
        env.HIGHLIGHT_GLOBAL_PROVIDER,
        { baseUrl: env.HIGHLIGHT_GLOBAL_BASE_URL, apiKey: env.HIGHLIGHT_GLOBAL_API_KEY },
        env,
      ),
      // section (fallback) = proveedor local
      createLlmProvider(
        env.HIGHLIGHT_LOCAL_PROVIDER,
        { baseUrl: env.HIGHLIGHT_LOCAL_BASE_URL, apiKey: env.HIGHLIGHT_LOCAL_API_KEY },
        env,
      ),
      {
        // Modelo principal (una pasada) = global; por sección (fallback) = local.
        model: env.HIGHLIGHT_GLOBAL_MODEL,
        sectionModel: env.HIGHLIGHT_LOCAL_MODEL,
        // Parámetros de comportamiento: del config on-demand (no de env).
        target: config.targetCount,
        minSec: config.minSec,
        maxSec: config.maxSec,
        pauseSec: env.SENTENCE_PAUSE_SEC,
        granularity: config.granularity,
        style: config.style,
        titleLanguage: config.titleLanguage,
        allowMultiSegment: config.allowMultiSegment,
        includeSummary: config.includeSummary,
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
        config: config as unknown as Prisma.InputJsonValue,
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
