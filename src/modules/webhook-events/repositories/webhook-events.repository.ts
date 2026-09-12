import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, sql, SQL } from 'drizzle-orm';
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

    if (opts?.reference) {
      conditions.push(eq(webhookEvents.reference, opts.reference));
    }
    if (opts?.eventType) {
      conditions.push(eq(webhookEvents.eventType, opts.eventType));
    }
    if (opts?.status) {
      conditions.push(eq(webhookEvents.status, opts.status));
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

  // ─── Inbox Pattern Methods ─────────────────────────────────────────────

  async ingest(
    eventType: string,
    reference: string,
    payload: unknown,
    tx?: DbOrTx,
  ): Promise<boolean> {
    const result = await this.executor(tx)
      .insert(webhookEvents)
      .values({
        id: uuidv7(),
        eventType,
        reference,
        payload,
      })
      .onConflictDoNothing({
        target: [webhookEvents.eventType, webhookEvents.reference],
      })
      .returning();

    // result length === 1 means inserted, 0 means duplicate (conflict)
    return result.length === 1;
  }

  async claimBatch(
    limit: number,
    workerId: string,
  ): Promise<(typeof webhookEvents.$inferSelect)[]> {
    return this.db.transaction(async (tx) => {
      // Lock pending rows, skip any already locked by another worker
      const rows = await tx.execute(sql`
        SELECT * FROM webhook_events
        WHERE status = 'pending'
          AND next_attempt_at <= now()
        ORDER BY created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);

      const typedRows =
        rows as unknown as (typeof webhookEvents.$inferSelect)[];
      if (typedRows.length === 0) return [];

      // Mark them as processing
      const ids = typedRows.map((r) => r.id);
      await tx
        .update(webhookEvents)
        .set({
          status: 'processing',
          lockedAt: new Date(),
          lockedBy: workerId,
        })
        .where(inArray(webhookEvents.id, ids));

      return typedRows;
    });
  }

  async markDone(id: string): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({
        status: 'done',
        processedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      })
      .where(eq(webhookEvents.id, id));
  }

  async markFailed(
    id: string,
    error: string,
    attempts: number,
    nextAttemptAt: Date,
    finalFailure: boolean,
  ): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({
        status: finalFailure ? 'failed' : 'pending',
        attempts,
        lastError: error,
        nextAttemptAt,
        lockedAt: null,
        lockedBy: null,
      })
      .where(eq(webhookEvents.id, id));
  }

  async reclaimStuck(staleThreshold: Date): Promise<number> {
    const result = await this.db
      .update(webhookEvents)
      .set({
        status: 'pending',
        lockedAt: null,
        lockedBy: null,
      })
      .where(
        and(
          eq(webhookEvents.status, 'processing'),
          lt(webhookEvents.lockedAt, staleThreshold),
        ),
      )
      .returning();

    return result.length;
  }
}
