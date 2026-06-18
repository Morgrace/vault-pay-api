import { bigint, pgEnum, uuid, varchar } from 'drizzle-orm/pg-core';
import { orders } from './orders';
import { planCurrencyEnum } from './plans';
import { text } from 'drizzle-orm/pg-core';
import { boolean } from 'drizzle-orm/pg-core';
import { timestamp } from 'drizzle-orm/pg-core';
import { jsonb } from 'drizzle-orm/pg-core';
import { index } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';

export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'success',
  'failed',
]);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    paystackReference: varchar('paystack_reference', { length: 255 }).unique(),
    idempotencyKey: varchar('idempotency_key', { length: 255 })
      .notNull()
      .unique(),
    status: transactionStatusEnum('status').notNull().default('pending'),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    currency: planCurrencyEnum('currency').notNull(),
    failureReason: text('failure_reason'),
    valueDelivered: boolean('value_delivered').notNull().default(false),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    gatewayResponse: jsonb('gateway_response'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_transactions_order_id').on(table.orderId),
    index('idx_transactions_status').on(table.status),
    index('idx_transactions_created_at').on(table.createdAt),
  ],
);
