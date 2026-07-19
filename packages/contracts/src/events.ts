import { z } from "zod";

/**
 * Contratos de eventos de dominio (event-driven).
 * Fase 1 solo PRODUCE VideoUploaded (persistido en outbox); el consumidor
 * llega en Fase 2. El contrato se congela aquí para no romper aguas abajo.
 *
 * Cadena objetivo:
 *   VideoUploaded → TranscriptionRequested → TranscriptGenerated →
 *   HighlightsDetected → ClipGenerated → ClipRendered → ExportCompleted
 */

export const EventType = {
  VideoUploaded: "VideoUploaded",
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export const videoUploadedPayloadSchema = z.object({
  eventId: z.string().uuid(),
  type: z.literal(EventType.VideoUploaded),
  videoId: z.string().uuid(),
  userId: z.string().uuid(),
  storageKey: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  durationSec: z.number().nonnegative().nullable(),
  container: z.string().nullable(),
  codec: z.string().nullable(),
  occurredAt: z.string().datetime(),
});

export type VideoUploadedPayload = z.infer<typeof videoUploadedPayloadSchema>;

/** Union discriminada para el relay del outbox (crece por fase). */
export const domainEventSchema = z.discriminatedUnion("type", [
  videoUploadedPayloadSchema,
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
