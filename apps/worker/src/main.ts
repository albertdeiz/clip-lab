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

const env = loadEnv();

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

  // Registra una cola de trabajo con su DLQ y un handler idempotente.
  async function consumeQueue<T>(
    queue: string,
    dlq: string,
    routingKey: string,
    parse: (raw: unknown) => T,
    handle: (payload: T) => Promise<void>,
    label: string,
  ): Promise<void> {
    await channel.assertQueue(dlq, { durable: true });
    await channel.bindQueue(dlq, DLX, queue); // DLX enruta por el nombre de la cola origen
    await channel.assertQueue(queue, {
      durable: true,
      deadLetterExchange: DLX,
      deadLetterRoutingKey: queue, // los fallos de esta cola van a SU dlq
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
          log(`✗ ${label}: ${String(err)}`);
          channel.nack(msg, false, false); // → DLQ vía DLX
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
