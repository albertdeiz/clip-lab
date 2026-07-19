/** Topología de RabbitMQ compartida entre API (publisher/relay) y workers. */

export const EXCHANGE = "clip.events"; // topic
export const DLX = "clip.events.dlx"; // dead-letter exchange

export const QUEUES = {
  transcription: "transcription.jobs",
  transcriptionDlq: "transcription.dlq",
} as const;

/** Routing keys = nombres de evento de dominio. */
export const ROUTING = {
  VideoUploaded: "VideoUploaded",
  TranscriptGenerated: "TranscriptGenerated",
} as const;

/** Canal de Redis pub/sub para progreso en vivo (worker → API → cliente). */
export const PROGRESS_CHANNEL = "transcription:progress";

export interface TranscriptionProgress {
  videoId: string;
  userId: string;
  status: "QUEUED" | "TRANSCRIBING" | "DONE" | "FAILED";
  message?: string;
}
