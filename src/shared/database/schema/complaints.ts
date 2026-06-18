import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { orders } from './orders';
import { subscriptions } from './subscriptions';
import { users } from './users';

export const complaintStatusEnum = pgEnum('complaint_status', [
  'open',
  'under_review',
  'resolved',
  'rejected',
]);

export const complaints = pgTable(
  'complaints',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    orderId: uuid('order_id').references(() => orders.id),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    status: complaintStatusEnum('status').notNull().default('open'),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolution: text('resolution'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    check(
      'chk_complaint_has_one_subject',
      sql`(${table.orderId} IS NOT NULL AND ${table.subscriptionId} IS NULL) OR (${table.orderId} IS NULL AND ${table.subscriptionId} IS NOT NULL)`,
    ),
    index('idx_complaints_user_id').on(table.userId),
    index('idx_complaints_status').on(table.status),
  ],
);
