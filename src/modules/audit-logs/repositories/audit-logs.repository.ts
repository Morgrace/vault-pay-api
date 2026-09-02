import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { BaseRepository, DbOrTx } from 'src/shared/database/base.repository';
import { DRIZZLE_DB } from 'src/shared/database/database.module';
import { auditLogs } from 'src/shared/database/schema';
import { IPaginatedResult, IPaginationOptions } from 'src/shared/types';

@Injectable()
export class AuditLogsRepository extends BaseRepository<typeof auditLogs> {
  constructor(@Inject(DRIZZLE_DB) db: PostgresJsDatabase) {
    super(db, auditLogs);
  }
  async append(
    data: typeof auditLogs.$inferInsert,
    tx?: DbOrTx,
  ): Promise<typeof auditLogs.$inferSelect> {
    const executor = tx ?? this.db;

    const [entry] = await executor.insert(auditLogs).values(data).returning();
    return entry;
  }

  async findByEntity(
    entityId: string,
    queryParams?: IPaginationOptions,
  ): Promise<IPaginatedResult<typeof auditLogs.$inferSelect>> {
    const page = queryParams?.page ?? 1;
    const limit = Math.min(queryParams?.limit ?? 50, 100);
    const offset = (page - 1) * limit;

    const where = eq(auditLogs.entityId, entityId);

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: sql<number>`count(*)` })
        .from(auditLogs)
        .where(where),
    ]);

    const total = Number(countResult[0]?.total ?? 0);

    return {
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    };
  }
}
