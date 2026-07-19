import * as amqp from "amqplib";
import {
  EXCHANGE,
  DLX,
  QUEUES,
  ROUTING,
  videoUploadedPayloadSchema,
} from "@clip-lab/contracts";
import { loadEnv } from "@clip-lab/config";
import { transcribe } from "./transcriber.js";

const env = loadEnv();

function log(msg: string): void {
  process.stdout.write(`[worker] ${msg}\n`);
}

async function main(): Promise<void> {
  const connection = await amqp.connect(env.RABBITMQ_URL);
  const channel = await connection.createChannel();

  // Topología: exchange principal + DLX + cola de transcripción con DLQ.
  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
  await channel.assertExchange(DLX, "topic", { durable: true });
  await channel.assertQueue(QUEUES.transcriptionDlq, { durable: true });
  await channel.bindQueue(QUEUES.transcriptionDlq, DLX, "#");
  await channel.assertQueue(QUEUES.transcription, {
    durable: true,
    deadLetterExchange: DLX,
  });
  await channel.bindQueue(QUEUES.transcription, EXCHANGE, ROUTING.VideoUploaded);
  await channel.prefetch(1);

  const publish = (routingKey: string, payload: unknown): void => {
    channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: "application/json",
    });
  };

  log(`escuchando ${QUEUES.transcription} (modelo Whisper: ${env.WHISPER_MODEL})`);

  await channel.consume(QUEUES.transcription, (msg) => {
    if (!msg) return;
    void (async () => {
      try {
        const raw = JSON.parse(msg.content.toString());
        const payload = videoUploadedPayloadSchema.parse(raw);
        log(`transcribiendo video ${payload.videoId}`);
        await transcribe(payload, publish);
        channel.ack(msg);
        log(`✓ transcrito ${payload.videoId}`);
      } catch (err) {
        log(`✗ error: ${String(err)}`);
        // requeue=false → va a la DLQ vía DLX
        channel.nack(msg, false, false);
      }
    })();
  });

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
