import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql, SQL } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { BaseRepository, DbOrTx } from 'src/database/base.repository';
import { DRIZZLE_DB } from 'src/database/database.module';
import { webhookEvents } from 'src/database/schema';
import { uuidv7 } from 'uuidv7';
import {
  TCreateWebhookEventsDto,
  TListWebhookEvents,
  TUpdateWebhookEventsDto,
} from '../validation/webhook-events-validation.schema';

@Injectable()
export class WebhookEventsRepository extends BaseRepository<
  typeof webhookEvents
> {
  constructor(@Inject(DRIZZLE_DB) db: PostgresJsDatabase) {
    super(db, webhookEvents);
  }

  async create(data: TCreateWebhookEventsDto, tx?: DbOrTx) {
    const [webhookEvent] = await this.executor(tx)
      .insert(webhookEvents)
      .values({ ...data, id: uuidv7() })
      .returning();

    return webhookEvent ?? null;
  }

  async findAll(opts?: TListWebhookEvents, tx?: DbOrTx) {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 25;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    if (opts?.eventId) {
      conditions.push(eq(webhookEvents.eventId, opts.eventId));
    }
    if (opts?.eventType) {
      conditions.push(eq(webhookEvents.eventType, opts.eventType));
    }
    if (opts?.processed !== undefined) {
      conditions.push(eq(webhookEvents.processed, opts?.processed));
    }

    const [items, countResult] = await Promise.all([
      this.executor(tx)
        .select()
        .from(webhookEvents)
        .where(and(...conditions))
        .orderBy(desc(webhookEvents.createdAt))
        .limit(limit)
        .offset(offset),

      this.executor(tx)
        .select({ total: sql`count(*)` })
        .from(webhookEvents)
        .where(and(...conditions)),
    ]);

    const total = Number(countResult[0]?.total ?? 0);
    return { items, total, page, pages: Math.ceil(total / limit), limit };
  }

  async findById(id: string, tx?: DbOrTx) {
    const [webhookEvent] = await this.executor(tx)
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, id));

    return webhookEvent ?? null;
  }

  async update(id: string, data: TUpdateWebhookEventsDto, tx?: DbOrTx) {
    const [webhookEvent] = await this.executor(tx)
      .update(webhookEvents)
      .set(data)
      .where(eq(webhookEvents.id, id))
      .returning();

    return webhookEvent ?? null;
  }
}
