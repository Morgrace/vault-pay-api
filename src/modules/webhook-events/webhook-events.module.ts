import { Module } from '@nestjs/common';
import { WebhookEventsService } from './services/webhook-events.service';
import { WebhookEventsRepository } from './repositories/webhook-events.repository';

@Module({
  exports: [WebhookEventsService],
  providers: [WebhookEventsService, WebhookEventsRepository],
})
export class WebhookEventsModule {}
