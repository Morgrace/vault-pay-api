import { Test, TestingModule } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { UsersRepository } from './users.repository';
import { DRIZZLE_DB } from 'src/shared/database/database.module';
import * as schema from 'src/shared/database/schema';
import { users } from 'src/shared/database/schema';

// ─── Test DB Config ──────────────────────────────────────────────────────────
// hardcoded — no ConfigService needed in tests, we own this connection
const TEST_DB_CONFIG = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'vaultpay_test',
  max: 5,
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('UsersRepository (integration)', () => {
  let repo: UsersRepository;
  let db: ReturnType<typeof drizzle>;
  let client: ReturnType<typeof postgres>;
  let module: TestingModule;

  beforeAll(async () => {
    // connect directly — bypass ConfigService entirely
    client = postgres(TEST_DB_CONFIG);
    db = drizzle(client, { schema });

    // run your actual migrations against the test DB
    // this creates the users table and the user_role enum
    // adjust path if your drizzle.config.ts points elsewhere
    await migrate(db, { migrationsFolder: './migrations' });

    // plug the real db connection in as the DRIZZLE_DB token
    module = await Test.createTestingModule({
      providers: [UsersRepository, { provide: DRIZZLE_DB, useValue: db }],
    }).compile();

    repo = module.get<UsersRepository>(UsersRepository);
  });

  afterAll(async () => {
    await module.close();
    await client.end(); // close the postgres-js connection pool
  });

  beforeEach(async () => {
    // wipe the table before every test — clean slate
    // no WHERE clause = delete all rows
    await db.delete(users);
  });

  // ── createUser ─────────────────────────────────────────────────────────────

  describe('createUser', () => {
    it('creates a user and returns it with a generated id', async () => {
      const result = await repo.createUser({
        email: 'test@gmail.com',
        provider: 'google',
        providerId: 'google-123',
      });

      expect(result.id).toBeDefined();
      expect(result.email).toBe('test@gmail.com');
      expect(result.role).toBe('user'); // DB default fires correctly
      expect(result.createdAt).toBeInstanceOf(Date); // DB default fires correctly
    });

    it('creates a user with optional fields', async () => {
      const result = await repo.createUser({
        email: 'full@gmail.com',
        fullName: 'Full Name',
        avatarUrl: 'https://photo.url',
        provider: 'google',
        providerId: 'google-456',
      });

      expect(result.fullName).toBe('Full Name');
      expect(result.avatarUrl).toBe('https://photo.url');
    });

    // these two tests prove your DB constraints actually work
    // unit tests cannot catch these — this is WHY integration tests exist

    it('throws on duplicate email — unique constraint enforced', async () => {
      await repo.createUser({
        email: 'dup@gmail.com',
        provider: 'google',
        providerId: 'google-789',
      });

      await expect(
        repo.createUser({
          email: 'dup@gmail.com', // same email, different provider
          provider: 'github',
          providerId: 'github-789',
        }),
      ).rejects.toThrow();
    });

    it('throws on duplicate provider + providerId — composite unique index enforced', async () => {
      await repo.createUser({
        email: 'first@gmail.com',
        provider: 'google',
        providerId: 'same-id',
      });

      await expect(
        repo.createUser({
          email: 'second@gmail.com', // different email
          provider: 'google',
          providerId: 'same-id', // same provider identity — must be blocked
        }),
      ).rejects.toThrow();
    });
  });

  // ── findByEmail ─────────────────────────────────────────────────────────────

  describe('findByEmail', () => {
    it('returns the user when email exists', async () => {
      await repo.createUser({
        email: 'find@gmail.com',
        provider: 'google',
        providerId: 'google-find',
      });

      const result = await repo.findByEmail('find@gmail.com');

      expect(result).not.toBeNull();
      expect(result?.email).toBe('find@gmail.com');
    });

    it('returns null when email does not exist', async () => {
      const result = await repo.findByEmail('ghost@gmail.com');

      expect(result).toBeNull();
    });
  });

  // ── findByProvider ──────────────────────────────────────────────────────────

  describe('findByProvider', () => {
    it('returns the user when provider and providerId both match', async () => {
      await repo.createUser({
        email: 'provider@gmail.com',
        provider: 'github',
        providerId: 'github-abc',
      });

      const result = await repo.findByProvider('github', 'github-abc');

      expect(result).not.toBeNull();
      expect(result?.providerId).toBe('github-abc');
    });

    it('returns null when provider matches but providerId does not', async () => {
      await repo.createUser({
        email: 'provider2@gmail.com',
        provider: 'google',
        providerId: 'google-real',
      });

      const result = await repo.findByProvider('google', 'google-fake');

      expect(result).toBeNull();
    });

    it('returns null when nothing matches', async () => {
      const result = await repo.findByProvider('github', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all users', async () => {
      await repo.createUser({
        email: 'a@gmail.com',
        provider: 'google',
        providerId: 'g-1',
      });
      await repo.createUser({
        email: 'b@gmail.com',
        provider: 'google',
        providerId: 'g-2',
      });

      const result = await repo.findAll();

      expect(result).toHaveLength(2);
    });

    it('returns empty array when table is empty', async () => {
      const result = await repo.findAll();

      expect(result).toEqual([]);
    });
  });
});
