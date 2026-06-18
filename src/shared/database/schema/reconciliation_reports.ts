import { index, integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const reconciliationReports = pgTable(
  'reconciliation_reports',
  {
    id: uuid('id').primaryKey(),
    runAt: timestamp('run_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    totalChecked: integer('total_checked').notNull(),
    mismatches: integer('mismatches').notNull(),
    resolved: integer('resolved').notNull(),
    reportData: jsonb('report_data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_reconciliation_run_at').on(table.runAt),
  ],
);
