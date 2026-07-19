import { Global, Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { MessagingService } from "./messaging.service.js";
import { OutboxRelayService } from "./outbox-relay.service.js";

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [MessagingService, OutboxRelayService],
  exports: [MessagingService],
})
export class MessagingModule {}
