import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lt, SQL, sql } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { BaseRepository, DbOrTx } from 'src/shared/database/base.repository';
import { DRIZZLE_DB } from 'src/shared/database/database.module';
import { orders } from 'src/shared/database/schema';
import { TListOrdersQuery } from '../validation/orders-validation.schema';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class OrdersRepository extends BaseRepository<typeof orders> {
  constructor(@Inject(DRIZZLE_DB) db: PostgresJsDatabase) {
    super(db, orders);
  }

  async findById(id: string) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id));
    return order;
  }

  async findAll(opts?: TListOrdersQuery) {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 25;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    if (opts?.articleId) {
      conditions.push(eq(orders.articleId, opts.articleId));
    }
    if (opts?.deliveredAt) {
      const { startOfDay, endOfDay } = this.resolveDate(opts.deliveredAt);
      conditions.push(gte(orders.deliveredAt, startOfDay));
      conditions.push(lt(orders.deliveredAt, endOfDay));
    }

    if (opts?.planId) {
      conditions.push(eq(orders.planId, opts.planId));
    }

    if (opts?.refundedAt) {
      const { startOfDay, endOfDay } = this.resolveDate(opts.refundedAt);
      conditions.push(gte(orders.refundedAt, startOfDay));
      conditions.push(lt(orders.refundedAt, endOfDay));
    }

    if (opts?.status) {
      conditions.push(eq(orders.status, opts.status));
    }

    if (opts?.userId) {
      conditions.push(eq(orders.userId, opts.userId));
    }

    if (opts?.valueDelivered !== undefined) {
      conditions.push(eq(orders.valueDelivered, opts.valueDelivered));
    }

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset),

      this.db
        .select({ total: sql`count(*)` })
        .from(orders)
        .where(and(...conditions)),
    ]);

    const total = Number(countResult[0]?.total ?? 0);
    return { items, total, page, pages: Math.ceil(total / limit), limit };
  }

  async create(
    data: Omit<
      typeof orders.$inferInsert,
      'id' | 'createdAt' | 'updatedAt' | 'valueDelivered'
    >,
    tx?: DbOrTx,
  ) {
    const executor = tx ?? this.db;

    const [order] = await executor
      .insert(orders)
      .values({ ...data, id: uuidv7() })
      .returning();
    return order ?? null;
  }

  async update(
    id: string,
    data: Partial<
      Omit<typeof orders.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
    >,
    tx?: DbOrTx,
  ) {
    const executor = tx ?? this.db;
    const [order] = await executor
      .update(orders)
      .set(data)
      .where(eq(orders.id, id))
      .returning();
    return order ?? null;
  }

  private resolveDate(date: string | Date): {
    startOfDay: Date;
    endOfDay: Date;
  } {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    return { startOfDay, endOfDay };
  }
}
