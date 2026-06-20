import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { articles } from './articles';
import { planCurrencyEnum, plans } from './plans';
import { users } from './users';
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'success',
  'failed',
  'refunded',
]);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    userId: uuid('user_id').references(() => users.id),
    articleId: uuid('article_id').references(() => articles.id),
    planId: uuid('plan_id').references(() => plans.id),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    currency: planCurrencyEnum('currency').notNull(),
    status: orderStatusEnum('status').notNull().default('pending'),
    valueDelivered: boolean('value_delivered').notNull().default(false),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    check(
      'chk_order_has_subject',
      sql`${table.articleId} IS NOT NULL OR ${table.planId} IS NOT NULL`,
    ),
    index('idx_orders_email').on(table.email),
    index('idx_orders_user_id').on(table.userId),
  ],
);
