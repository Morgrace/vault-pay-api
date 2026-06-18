import { boolean, index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey(),
    eventId: varchar('event_id', { length: 255 }).notNull().unique(),
    eventType: varchar('event_type', { length: 255 }).notNull(),
    payload: jsonb('payload').notNull(),
    processed: boolean('processed').notNull().default(false),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_webhook_events_processed').on(table.processed),
    index('idx_webhook_events_event_type').on(table.eventType),
    index('idx_webhook_events_created_at').on(table.createdAt),
  ],
);
