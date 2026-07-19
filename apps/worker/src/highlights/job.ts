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
import { AnthropicClient } from "./anthropic.js";
import { HighlightDetector } from "./detector.js";
import type { Word } from "./chunker.js";

const env = loadEnv();

/**
 * Detecta highlights para un video ya transcrito. Idempotente por videoId.
 * Si falta ANTHROPIC_API_KEY, marca FAILED con motivo claro (no es un stub:
 * la feature exige la credencial para razonar con el LLM).
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

  if (!env.ANTHROPIC_API_KEY) {
    await prisma.highlightSet.update({
      where: { videoId },
      data: {
        status: "FAILED",
        failReason: "ANTHROPIC_API_KEY no configurado",
      },
    });
    throw new NonRetryableError("ANTHROPIC_API_KEY no configurado");
  }

  try {
    const detector = new HighlightDetector(
      new AnthropicClient(env.ANTHROPIC_API_KEY),
      {
        localModel: env.HIGHLIGHT_LOCAL_MODEL,
        globalModel: env.HIGHLIGHT_GLOBAL_MODEL,
        chunkSeconds: env.CHUNK_SECONDS,
        overlapSeconds: env.CHUNK_OVERLAP_SECONDS,
        target: env.HIGHLIGHTS_TARGET,
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
        failReason: "No se pudieron detectar highlights",
      },
    });
    throw err;
  }
}
