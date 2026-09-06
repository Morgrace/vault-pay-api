import {
  bigint,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { orders } from './orders';
import { planCurrencyEnum } from './plans';

export const TRANSACTION_STATUS_VALUES = [
  'pending',
  'success',
  'failed',
] as const;
export const transactionStatusEnum = pgEnum(
  'transaction_status',
  TRANSACTION_STATUS_VALUES,
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    gatewayReference: varchar('gateway_reference', { length: 255 }).unique(),
    gatewayProvider: varchar('gateway_provider', { length: 50 }),
    status: transactionStatusEnum('status').notNull().default('pending'),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    currency: planCurrencyEnum('currency').notNull(),
    failureReason: text('failure_reason'),
    gatewayResponse: jsonb('gateway_response'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_transactions_order_id').on(table.orderId)],
);
