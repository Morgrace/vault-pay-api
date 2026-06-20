import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const planCurrencyEnum = pgEnum('plan_currency', ['NGN', 'USD']);
export const planIntervalEnum = pgEnum('plan_interval', [
  'weekly',
  'monthly',
  'yearly',
]);
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  features: text('features'),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  currency: planCurrencyEnum('currency').notNull().default('NGN'),
  interval: planIntervalEnum('interval').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
