import { PgTable } from 'drizzle-orm/pg-core';
import {
  PostgresJsDatabase,
  PostgresJsTransaction,
} from 'drizzle-orm/postgres-js';
export type DbOrTx = PostgresJsDatabase<any> | PostgresJsTransaction<any, any>;
export class BaseRepository<T extends PgTable> {
  constructor(
    protected readonly db: PostgresJsDatabase,
    protected readonly table: T,
  ) {}

  protected executor(tx?: DbOrTx) {
    return tx ?? this.db;
  }
  async transaction<R>(fn: (tx: PostgresJsDatabase) => Promise<R>): Promise<R> {
    return this.db.transaction(fn);
  }
}
