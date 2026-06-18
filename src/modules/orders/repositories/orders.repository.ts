import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { BaseRepository } from 'src/shared/database/base.repository';
import { DRIZZLE_DB } from 'src/shared/database/database.module';
import { orders } from 'src/shared/database/schema';

@Injectable()
export class OrdersRepository extends BaseRepository<typeof orders> {
  constructor(@Inject(DRIZZLE_DB) db: PostgresJsDatabase) {
    super(db, orders);
  }

  async findUserByPurchase(articleId: string, userId: string) {
    const result = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.articleId, articleId),
          eq(orders.userId, userId),
          eq(orders.status, 'success'),
        ),
      )
      .limit(1);
    return result[0] || null;
  }
}
