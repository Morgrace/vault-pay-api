import {
  pgTable,
  uuid,
  boolean,
  timestamp,
  bigint,
  varchar,
  text,
} from 'drizzle-orm/pg-core';
import { planCurrencyEnum } from './plans';
import { users } from './users';
import { check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { index } from 'drizzle-orm/pg-core';

export const articles = pgTable(
  'articles',
  {
    id: uuid('id').primaryKey(),
    title: varchar('title', { length: 500 }).notNull(),
    content: text('content').notNull(),
    coverImageUrl: varchar('cover_image_url', { length: 500 }),
    isFree: boolean('is_free').notNull().default(false),
    price: bigint('price', { mode: 'number' }),
    currency: planCurrencyEnum('currency'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'chk_paid_article_has_price',
      sql`${table.isFree} = true OR (${table.price} IS NOT NULL AND ${table.currency} IS NOT NULL)`,
    ),
    index('idx_articles_published_at').on(table.publishedAt),
  ],
);
