import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { DbOrTx } from 'src/database/base.repository';
import { WebhookEventsRepository } from '../repositories/webhook-events.repository';
import {
  createWebhookEventsSchema,
  listWebhookEventsSchema,
  updateWebhookEventsSchema,
} from '../validation/webhook-events-validation.schema';

@Injectable()
export class WebhookEventsService {
  constructor(private readonly webhookEventsRepo: WebhookEventsRepository) {}
  async create(dto: unknown, tx?: DbOrTx) {
    const parsed = createWebhookEventsSchema.safeParse(dto);

    if (!parsed.success) {
      throw new UnprocessableEntityException(parsed.error, 'Validation failed');
    }

    return this.webhookEventsRepo.create(parsed.data, tx);
  }

  async findAll(query: unknown, tx?: DbOrTx) {
    const parsed = listWebhookEventsSchema.safeParse(query);
    if (!parsed.success) {
      throw new UnprocessableEntityException(parsed.error, 'Validation failed');
    }
    return this.webhookEventsRepo.findAll(parsed.data, tx);
  }

  findById(id: string, tx?: DbOrTx) {
    return this.webhookEventsRepo.findById(id, tx);
  }

  async update(id: string, dto: unknown, tx?: DbOrTx) {
    const parsed = updateWebhookEventsSchema.safeParse(dto);
    if (!parsed.success) {
      throw new UnprocessableEntityException(parsed.error, 'Validation failed');
    }
    return this.webhookEventsRepo.update(id, parsed.data, tx);
  }
}
