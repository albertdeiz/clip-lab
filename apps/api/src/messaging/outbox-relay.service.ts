import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service.js";
import { MessagingService } from "./messaging.service.js";

/**
 * Relay del transactional outbox: publica a RabbitMQ los eventos pendientes
 * (publishedAt = null) y los marca como publicados. At-least-once.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  @Interval(2000)
  async drain(): Promise<void> {
    if (this.running || !this.messaging.connected) return;
    this.running = true;
    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      for (const event of pending) {
        await this.messaging.publish(event.type, event.payload);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
      }
      if (pending.length > 0) {
        this.logger.log(`Relay publicó ${pending.length} evento(s)`);
      }
    } catch (err) {
      this.logger.warn(`Relay falló (reintenta): ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
