import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { BaseRepository } from 'src/shared/database/base.repository';
import { DRIZZLE_DB } from 'src/shared/database/database.module';
import { auditLogs } from 'src/shared/database/schema';
import {
  IPaginatedResult,
  IPaginationOptions,
} from 'src/shared/types/query.interfaces';

@Injectable()
export class AuditLogsRepository extends BaseRepository<typeof auditLogs> {
  constructor(@Inject(DRIZZLE_DB) db: PostgresJsDatabase) {
    super(db, auditLogs);
  }
  async append(
    data: typeof auditLogs.$inferInsert,
  ): Promise<typeof auditLogs.$inferSelect> {
    const [entry] = await this.db.insert(auditLogs).values(data).returning();
    return entry;
  }

  async findByEntity(
    entityType: string,
    entityId: string,
    options?: IPaginationOptions,
  ): Promise<IPaginatedResult<typeof auditLogs.$inferSelect>> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 50;
    const offset = (page - 1) * limit;

    const where = and(
      eq(auditLogs.entityType, entityType),
      eq(auditLogs.entityId, entityId),
    );

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
