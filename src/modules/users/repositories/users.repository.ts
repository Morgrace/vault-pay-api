import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { BaseRepository } from 'src/shared/database/base.repository';
import { DRIZZLE_DB } from 'src/shared/database/database.module';
import { users } from 'src/shared/database/schema';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class UsersRepository extends BaseRepository<typeof users> {
  constructor(@Inject(DRIZZLE_DB) db: PostgresJsDatabase) {
    super(db, users);
  }
  async findByEmail(email: string) {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email));

    return result[0] || null;
  }
  async findByProvider(provider: string, providerId: string) {
    const result = await this.db
      .select()
      .from(users)
      .where(
        and(eq(users.provider, provider), eq(users.providerId, providerId)),
      );
    return result[0] || null;
  }

  async createUser(
    data: Omit<typeof users.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>,
  ) {
    const [newUser] = await this.db
      .insert(users)
      .values({ ...data, id: uuidv7() })
      .returning();
    return newUser;
  }

  async findAll() {
    return this.db.select().from(users);
  }
}
