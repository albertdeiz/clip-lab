import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import * as amqp from "amqplib";
import { EXCHANGE } from "@clip-lab/contracts";
import type { Env } from "@clip-lab/config";
import { ENV } from "../config/config.module.js";

/**
 * Publisher del bus de eventos (topic exchange durable). Único punto de
 * publicación; lo usa el relay del outbox.
 */
@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.env.RABBITMQ_URL);
      this.channel = await this.connection.createConfirmChannel();
      await this.channel.assertExchange(EXCHANGE, "topic", { durable: true });
      this.logger.log("Conectado a RabbitMQ");
    } catch (err) {
      this.logger.error(`No se pudo conectar a RabbitMQ: ${String(err)}`);
      // Reintenta; el relay seguirá encolando en el outbox mientras tanto.
      setTimeout(() => void this.connect(), 3000);
    }
  }

  get connected(): boolean {
    return Boolean(this.channel);
  }

  async publish(routingKey: string, payload: unknown): Promise<void> {
    if (!this.channel) throw new Error("Canal de RabbitMQ no disponible");
    const body = Buffer.from(JSON.stringify(payload));
    await new Promise<void>((resolve, reject) => {
      this.channel!.publish(
        EXCHANGE,
        routingKey,
        body,
        { persistent: true, contentType: "application/json" },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}
