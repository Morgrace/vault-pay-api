import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { plans } from './plans';
import { users } from './users';
import { uniqueIndex } from 'drizzle-orm/pg-core';
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'initiated', // row created, payment not yet confirmed
  'active', // paying, within current period
  'past_due', // payment failed, within retry grace period
  'suspended', // max retries exhausted, access cut off
  'cancelled', // user or admin cancelled
  'non_renewing', // Paystack's own status: active but set to not renew
]);
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatusEnum('status').notNull().default('initiated'),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    retryCount: integer('retry_count').notNull().default(0),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    paystackSubCode: varchar('paystack_sub_code', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_subscriptions_status').on(table.status),
    index('idx_subscriptions_user_id').on(table.userId),
    index('idx_subscriptions_current_period_end').on(table.currentPeriodEnd),
    uniqueIndex('idx_subscriptions_active_unique')
      .on(table.userId)
      .where(
        sql`${table.status} IN ('initiated', 'active', 'past_due', 'non_renewing')`,
      ),
  ],
);
