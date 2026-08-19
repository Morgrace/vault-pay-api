import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  SQL,
  sql,
} from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { BaseRepository } from 'src/shared/database/base.repository';
import { DRIZZLE_DB } from 'src/shared/database/database.module';
import { articles } from 'src/shared/database/schema';
import { uuidv7 } from 'uuidv7';
import { TListArticleQuery } from '../validation/article-validation.schema';

@Injectable()
export class ArticleRepository extends BaseRepository<typeof articles> {
  constructor(@Inject(DRIZZLE_DB) db: PostgresJsDatabase) {
    super(db, articles);
  }
  async create(
    data: Omit<
      typeof articles.$inferInsert,
      'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
    >,
  ) {
    const [article] = await this.db
      .insert(articles)
      .values({ ...data, id: uuidv7() })
      .returning();
    return article;
  }

  // async createDraft(
  //   data: Omit<
  //     typeof articles.$inferInsert,
  //     'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
  //   >,
  // ) {
  //   const [article] = await this.db
  //     .insert(articles)
  //     .values({ ...data, id: uuidv7() })
  //     .returning();
  //   return article;
  // }

  async findById(id: string) {
    // works for all articles - published or unpublished
    const [article] = await this.db
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)));
    return article ?? null;
  }

  async findAll(opts?: TListArticleQuery) {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 25;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [isNull(articles.deletedAt)];

    if (opts?.isFree !== undefined) {
      conditions.push(eq(articles.isFree, opts.isFree));
    }

    if (opts?.isPublished === false) {
      conditions.push(isNull(articles.publishedAt));
    }

    if (opts?.isPublished) {
      conditions.push(isNotNull(articles.publishedAt));
    }

    if (opts?.search) {
      conditions.push(ilike(articles.title, `%${opts.search}%`));
    }

    if (opts?.minPrice !== undefined) {
      conditions.push(gte(articles.price, opts.minPrice));
    }

    if (opts?.maxPrice !== undefined) {
      conditions.push(lte(articles.price, opts.maxPrice));
    }

    const articleColumns = getTableColumns(articles);

    const [items, countResult] = await Promise.all([
      this.db
        .select({
          ...articleColumns,
          excerpt: sql`LEFT(${articles.content},100)`,
        })
        .from(articles)
        .where(and(...conditions))
        .orderBy(desc(articles.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: sql<string>`count(*)` })
        .from(articles)
        .where(and(...conditions)),
    ]);

    const total = Number(countResult[0]?.total ?? 0);
    return { items, total, page, pages: Math.ceil(total / limit), limit };
  }

  async update(
    id: string,
    data: Partial<
      Omit<
        typeof articles.$inferInsert,
        'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'deletedAt'
      >
    >,
  ) {
    const [article] = await this.db
      .update(articles)
      .set({ ...data, updatedAt: sql`now()` })
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .returning();
    return article ?? null;
  }

  async publish(id: string) {
    const [article] = await this.db
      .update(articles)
      .set({ publishedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .returning();

    return article ?? null;
  }

  async unPublish(id: string) {
    const [article] = await this.db
      .update(articles)
      .set({ publishedAt: null, updatedAt: sql`now()` })
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .returning();
    return article ?? null;
  }

  async remove(id: string) {
    const [article] = await this.db
      .update(articles)
      .set({
        title: sql`${articles.title} || '-deleted=' || ${uuidv7()}`,
        deletedAt: sql`now()`,
      })
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .returning();
    return article ?? null;
  }
}
