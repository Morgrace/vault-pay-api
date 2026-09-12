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

  // ─── Inbox Pattern Methods ─────────────────────────────────────────────

  async ingest(eventType: string, reference: string, payload: unknown) {
    return this.webhookEventsRepo.ingest(eventType, reference, payload);
  }

  async claimBatch(limit: number, workerId: string) {
    return this.webhookEventsRepo.claimBatch(limit, workerId);
  }

  async markDone(id: string) {
    return this.webhookEventsRepo.markDone(id);
  }

  async markFailed(
    id: string,
    error: string,
    attempts: number,
    maxAttempts: number,
  ) {
    const finalFailure = attempts >= maxAttempts;

    // Exponential backoff: 30s, 60s, 120s, 240s...
    const delayMs = finalFailure ? 0 : 30_000 * Math.pow(2, attempts);
    const nextAttemptAt = new Date(Date.now() + delayMs);

    return this.webhookEventsRepo.markFailed(
      id,
      error,
      attempts,
      nextAttemptAt,
      finalFailure,
    );
  }

  async reclaimStuck(staleMinutes: number) {
    const threshold = new Date(Date.now() - staleMinutes * 60_000);
    return this.webhookEventsRepo.reclaimStuck(threshold);
  }
}
