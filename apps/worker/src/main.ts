import * as amqp from "amqplib";
import {
  EXCHANGE,
  DLX,
  QUEUES,
  ROUTING,
  videoUploadedPayloadSchema,
  transcriptGeneratedPayloadSchema,
} from "@clip-lab/contracts";
import { loadEnv } from "@clip-lab/config";
import { transcribe } from "./transcriber.js";
import { detectHighlights } from "./highlights/job.js";
import { NonRetryableError } from "./errors.js";

const env = loadEnv();

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 300_000; // 5 min

function backoffMs(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS);
}

function log(msg: string): void {
  process.stdout.write(`[worker] ${msg}\n`);
}

async function main(): Promise<void> {
  const connection = await amqp.connect(env.RABBITMQ_URL);
  const channel = await connection.createChannel();

  // Topología: exchange principal + DLX compartido.
  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
  await channel.assertExchange(DLX, "topic", { durable: true });
  await channel.prefetch(1);

  const publish = (routingKey: string, payload: unknown): void => {
    channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: "application/json",
    });
  };

  // Registra una cola de trabajo con DLQ, cola de reintento (backoff) y handler.
  async function consumeQueue<T>(
    queue: string,
    dlq: string,
    routingKey: string,
    parse: (raw: unknown) => T,
    handle: (payload: T) => Promise<void>,
    label: string,
  ): Promise<void> {
    const retryQueue = `${queue}.retry`;
    await channel.assertQueue(dlq, { durable: true });
    await channel.bindQueue(dlq, DLX, queue);
    // Cola de espera: los mensajes vencen tras `expiration` y vuelven a la cola
    // principal (dead-letter al EXCHANGE con el routing key original).
    await channel.assertQueue(retryQueue, {
      durable: true,
      deadLetterExchange: EXCHANGE,
      deadLetterRoutingKey: routingKey,
    });
    await channel.assertQueue(queue, {
      durable: true,
      deadLetterExchange: DLX,
      deadLetterRoutingKey: queue,
    });
    await channel.bindQueue(queue, EXCHANGE, routingKey);

    await channel.consume(queue, (msg) => {
      if (!msg) return;
      void (async () => {
        try {
          const payload = parse(JSON.parse(msg.content.toString()));
          await handle(payload);
          channel.ack(msg);
          log(`✓ ${label}`);
        } catch (err) {
          const attempts = Number(msg.properties.headers?.["x-attempts"] ?? 0);
          const retryable =
            !(err instanceof NonRetryableError) && attempts + 1 < MAX_ATTEMPTS;
          if (retryable) {
            const delay = backoffMs(attempts);
            channel.sendToQueue(retryQueue, msg.content, {
              persistent: true,
              expiration: String(delay),
              headers: { ...msg.properties.headers, "x-attempts": attempts + 1 },
            });
            log(
              `↻ ${label}: reintento ${attempts + 1}/${MAX_ATTEMPTS} en ${delay / 1000}s (${String(err)})`,
            );
          } else {
            channel.sendToQueue(dlq, msg.content, {
              persistent: true,
              headers: msg.properties.headers,
            });
            log(`✗ ${label}: a DLQ tras ${attempts} intento(s) (${String(err)})`);
          }
          channel.ack(msg); // ack del original; el reintento/park ya se encoló
        }
      })();
    });
    log(`escuchando ${queue} (${routingKey})`);
  }

  await consumeQueue(
    QUEUES.transcription,
    QUEUES.transcriptionDlq,
    ROUTING.VideoUploaded,
    (raw) => videoUploadedPayloadSchema.parse(raw),
    (p) => transcribe(p, publish),
    "transcripción",
  );

  await consumeQueue(
    QUEUES.highlights,
    QUEUES.highlightsDlq,
    ROUTING.TranscriptGenerated,
    (raw) => transcriptGeneratedPayloadSchema.parse(raw),
    (p) => detectHighlights(p, publish),
    "highlights",
  );

  log(`Whisper: ${env.WHISPER_MODEL} · Highlights: ${env.HIGHLIGHT_GLOBAL_MODEL}`);

  const shutdown = async (): Promise<void> => {
    log("cerrando…");
    await channel.close().catch(() => undefined);
    await connection.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  process.stderr.write(`[worker] fatal: ${String(err)}\n`);
  process.exit(1);
});
