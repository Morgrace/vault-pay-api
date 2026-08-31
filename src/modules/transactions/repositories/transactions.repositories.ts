import { Inject, Injectable } from '@nestjs/common';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { BaseRepository, DbOrTx } from 'src/shared/database/base.repository';
import { DRIZZLE_DB } from 'src/shared/database/database.module';
import { transactions } from 'src/shared/database/schema';
import {
  TCreateTransactionsDto,
  TListTransactionQuery,
  TUpdateTransactionDto,
} from '../validation/transactions-validation.schema';
import { uuidv7 } from 'uuidv7';
import { and, desc, eq, sql, SQL } from 'drizzle-orm';

@Injectable()
export class TransactionRepository extends BaseRepository<typeof transactions> {
  constructor(@Inject(DRIZZLE_DB) db: PostgresJsDatabase) {
    super(db, transactions);
  }

  async create(dto: TCreateTransactionsDto, tx?: DbOrTx) {
    const [transaction] = await this.executor(tx)
      .insert(transactions)
      .values({ ...dto, id: uuidv7() })
      .returning();

    return transaction ?? null;
  }

  async findById(id: string, tx?: DbOrTx) {
    const [transaction] = await this.executor(tx)
      .select()
      .from(transactions)
      .where(eq(transactions.id, id));
    return transaction ?? null;
  }

  async find(opts?: TListTransactionQuery, tx?: DbOrTx) {
    const limit = opts?.limit ?? 25;
    const page = opts?.page ?? 1;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    if (opts?.gatewayReference) {
      conditions.push(eq(transactions.gatewayReference, opts.gatewayReference));
    }
    if (opts?.orderId) {
      conditions.push(eq(transactions.orderId, opts.orderId));
    }
    if (opts?.status) {
      conditions.push(eq(transactions.status, opts.status));
    }
    const [items, countResult] = await Promise.all([
      this.executor(tx)
        .select()
        .from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.createdAt))
        .limit(limit)
        .offset(offset),

      this.executor(tx)
        .select({ total: sql`count(*)` })
        .from(transactions)
        .where(and(...conditions)),
    ]);

    const total = Number(countResult[0]?.total ?? 0);
    return { items, total, page, pages: Math.ceil(total / limit), limit };
  }

  async update(id: string, dto: TUpdateTransactionDto, tx?: DbOrTx) {
    const [transaction] = await this.executor(tx)
      .update(transactions)
      .set(dto)
      .where(eq(transactions.id, id))
      .returning();
    return transaction ?? null;
  }
}
