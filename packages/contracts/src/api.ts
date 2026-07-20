import { z } from "zod";

/** Esquemas de request/response de la API — fuente de verdad compartida FE/BE. */

export const videoStatusSchema = z.enum([
  "UPLOADING",
  "PROCESSING",
  "READY",
  "FAILED",
]);
export type VideoStatus = z.infer<typeof videoStatusSchema>;

export const allowedContentTypes = [
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
] as const;

// --- Auth ---
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  expiresInSec: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

// --- Uploads ---
export const createUploadSchema = z.object({
  filename: z.string().min(1).max(512),
  sizeBytes: z.number().int().positive(),
  contentType: z.enum(allowedContentTypes),
});
export type CreateUploadInput = z.infer<typeof createUploadSchema>;

export const createUploadResponseSchema = z.object({
  videoId: z.string().uuid(),
  uploadId: z.string(),
  partSizeBytes: z.number().int().positive(),
});
export type CreateUploadResponse = z.infer<typeof createUploadResponseSchema>;

export const signPartSchema = z.object({
  partNumber: z.number().int().min(1).max(10_000),
});
export type SignPartInput = z.infer<typeof signPartSchema>;

export const signPartResponseSchema = z.object({
  url: z.string().url(),
  expiresInSec: z.number().int().positive(),
});
export type SignPartResponse = z.infer<typeof signPartResponseSchema>;

export const completeUploadSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1),
        etag: z.string().min(1),
      }),
    )
    .min(1),
});
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

// --- Video ---
export const videoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: videoStatusSchema,
  durationSec: z.number().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  fps: z.number().nullable(),
  codec: z.string().nullable(),
  container: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  failReason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Video = z.infer<typeof videoSchema>;

export const videoListResponseSchema = z.object({
  items: z.array(videoSchema),
  nextCursor: z.string().nullable(),
});
export type VideoListResponse = z.infer<typeof videoListResponseSchema>;

export const playbackUrlResponseSchema = z.object({
  url: z.string().url(),
  expiresInSec: z.number().int().positive(),
});
export type PlaybackUrlResponse = z.infer<typeof playbackUrlResponseSchema>;

// --- Transcript ---
export const transcriptStatusSchema = z.enum([
  "QUEUED",
  "TRANSCRIBING",
  "DONE",
  "FAILED",
]);
export type TranscriptStatus = z.infer<typeof transcriptStatusSchema>;

export const transcriptWordSchema = z.object({
  w: z.string(),
  start: z.number(),
  end: z.number(),
});
export type TranscriptWord = z.infer<typeof transcriptWordSchema>;

export const transcriptResponseSchema = z.object({
  status: transcriptStatusSchema,
  language: z.string().nullable(),
  model: z.string().nullable(),
  text: z.string().nullable(),
  words: z.array(transcriptWordSchema),
  failReason: z.string().nullable(),
});
export type TranscriptResponse = z.infer<typeof transcriptResponseSchema>;

// --- Highlights ---
export const highlightStatusSchema = z.enum([
  "QUEUED",
  "DETECTING",
  "DONE",
  "FAILED",
]);
export type HighlightStatus = z.infer<typeof highlightStatusSchema>;

export const highlightSchema = z.object({
  start: z.number(),
  end: z.number(),
  score: z.number(), // 0-1
  title: z.string(),
  reason: z.string(),
});
export type Highlight = z.infer<typeof highlightSchema>;

export const highlightsResponseSchema = z.object({
  status: highlightStatusSchema,
  model: z.string().nullable(),
  costUsd: z.number().nullable(),
  items: z.array(highlightSchema),
  failReason: z.string().nullable(),
});
export type HighlightsResponse = z.infer<typeof highlightsResponseSchema>;

/** Edición manual del set de highlights (reemplaza la lista completa). */
export const updateHighlightsSchema = z.object({
  items: z
    .array(
      highlightSchema.extend({
        // score/reason opcionales al editar a mano
        score: z.number().default(0.5),
        reason: z.string().default(""),
      }),
    )
    .max(50),
});
export type UpdateHighlightsInput = z.infer<typeof updateHighlightsSchema>;

// --- Clips ---
export const clipStatusSchema = z.enum([
  "QUEUED",
  "RENDERING",
  "READY",
  "FAILED",
]);
export type ClipStatus = z.infer<typeof clipStatusSchema>;

export const clipSchema = z.object({
  id: z.string().uuid(),
  index: z.number().int(),
  title: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  aspectRatio: z.string(),
  status: clipStatusSchema,
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationSec: z.number().nullable(),
  sizeBytes: z.number().int().nullable(),
  failReason: z.string().nullable(),
});
export type Clip = z.infer<typeof clipSchema>;

export const clipListResponseSchema = z.object({
  items: z.array(clipSchema),
});
export type ClipListResponse = z.infer<typeof clipListResponseSchema>;

// --- Error uniforme ---
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
