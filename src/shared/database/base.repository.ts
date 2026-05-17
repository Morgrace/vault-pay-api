import { PgTable } from 'drizzle-orm/pg-core';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export class BaseRepository<T extends PgTable> {
  constructor(
    protected readonly db: PostgresJsDatabase,
    protected readonly table: T,
  ) {}
}
