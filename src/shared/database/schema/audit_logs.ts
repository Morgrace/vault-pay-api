import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  inet,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    event: varchar('event', { length: 255 }).notNull(),
    actorType: varchar('actor_type', { length: 50 }).notNull(),
    actorId: uuid('actor_id'),
    previousState: jsonb('previous_state'),
    newState: jsonb('new_state'),
    ipAddress: inet('ip_address'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_audit_logs_entity').on(table.entityType, table.entityId),
    index('idx_audit_logs_actor')
      .on(table.actorId)
      .where(sql`${table.actorId} IS NOT NULL`),
  ],
);
