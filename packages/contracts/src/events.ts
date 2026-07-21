import { z } from "zod";
import { generationConfigSchema } from "./api.js";

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
  TranscriptGenerated: "TranscriptGenerated",
  HighlightsRequested: "HighlightsRequested",
  HighlightsDetected: "HighlightsDetected",
  ClipGenerated: "ClipGenerated",
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

export const transcriptGeneratedPayloadSchema = z.object({
  eventId: z.string().uuid(),
  type: z.literal(EventType.TranscriptGenerated),
  videoId: z.string().uuid(),
  userId: z.string().uuid(),
  language: z.string().nullable(),
  model: z.string(),
  wordCount: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
});

export type TranscriptGeneratedPayload = z.infer<
  typeof transcriptGeneratedPayloadSchema
>;

export const highlightsRequestedPayloadSchema = z.object({
  eventId: z.string().uuid(),
  type: z.literal(EventType.HighlightsRequested),
  videoId: z.string().uuid(),
  userId: z.string().uuid(),
  config: generationConfigSchema,
  occurredAt: z.string().datetime(),
});

export type HighlightsRequestedPayload = z.infer<
  typeof highlightsRequestedPayloadSchema
>;

export const highlightsDetectedPayloadSchema = z.object({
  eventId: z.string().uuid(),
  type: z.literal(EventType.HighlightsDetected),
  videoId: z.string().uuid(),
  userId: z.string().uuid(),
  count: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  occurredAt: z.string().datetime(),
});

export type HighlightsDetectedPayload = z.infer<
  typeof highlightsDetectedPayloadSchema
>;

export const clipGeneratedPayloadSchema = z.object({
  eventId: z.string().uuid(),
  type: z.literal(EventType.ClipGenerated),
  videoId: z.string().uuid(),
  userId: z.string().uuid(),
  clipId: z.string().uuid(),
  index: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
});

export type ClipGeneratedPayload = z.infer<typeof clipGeneratedPayloadSchema>;

/** Union discriminada para el relay del outbox (crece por fase). */
export const domainEventSchema = z.discriminatedUnion("type", [
  videoUploadedPayloadSchema,
  transcriptGeneratedPayloadSchema,
  highlightsRequestedPayloadSchema,
  highlightsDetectedPayloadSchema,
  clipGeneratedPayloadSchema,
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
