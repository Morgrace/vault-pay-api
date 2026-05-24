import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import Redis from 'ioredis';
import axios from 'axios';
import { AuthService } from './auth.service';
import { RedisService } from 'src/shared/redis/redis.service';
import { UsersService } from '../../users/services/users.service';
import { ConfigService } from '@nestjs/config';

// still mocking axios — no real Google/GitHub in tests
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// still mocking UsersService — that layer has its own integration tests
const mockUsersService = { findOrCreate: jest.fn() };

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      'oauth.google.clientID': 'google-client-id',
      'oauth.google.clientSecret': 'google-client-secret',
      'oauth.google.callbackURL': 'http://localhost:3000/auth/google/callback',
      'oauth.github.clientID': 'github-client-id',
      'oauth.github.clientSecret': 'github-client-secret',
      'oauth.github.callbackURL': 'http://localhost:3000/auth/github/callback',
    };
    return config[key];
  }),
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AuthService (integration - real Redis)', () => {
  let service: AuthService;
  let redisClient: Redis;
  let module: TestingModule;

  beforeAll(async () => {
    // db: 1 — isolated from your dev app which runs on db: 0
    // flushdb here never affects your real data
    redisClient = new Redis({ host: 'localhost', port: 6379, db: 1 });

    // wait until connection is actually ready before running any test
    await new Promise<void>((resolve, reject) => {
      redisClient.once('ready', resolve);
      redisClient.once('error', reject);
    });

    // inject the real Redis client wrapped to match RedisService shape
    const mockRedisService = { client: redisClient };

    module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    await redisClient.flushdb(); // clean up everything after the full suite
    await redisClient.quit(); // graceful disconnect — not .disconnect()
    await module.close();
  });

  beforeEach(async () => {
    await redisClient.flushdb(); // clean slate before every single test
    jest.clearAllMocks();
  });

  // ── getAuthorizationUrl ──────────────────────────────────────────────────

  describe('getAuthorizationUrl', () => {
    it('state key actually exists in Redis after call', async () => {
      const url = await service.getAuthorizationUrl('google');
      const state = new URL(url).searchParams.get('state')!;

      // reach into real Redis and verify — unit test cannot do this
      const stored = await redisClient.get(`oauth_state:${state}`);
      expect(stored).toBe('google');
    });

    it('state key has a TTL [Time To Live] close to 600 seconds', async () => {
      const url = await service.getAuthorizationUrl('google');
      const state = new URL(url).searchParams.get('state')!;

      const ttl = await redisClient.ttl(`oauth_state:${state}`);

      // allow small margin for test execution time
      expect(ttl).toBeGreaterThan(595);
      expect(ttl).toBeLessThanOrEqual(600);
    });

    it('each call generates a unique state — no collisions', async () => {
      const url1 = await service.getAuthorizationUrl('google');
      const url2 = await service.getAuthorizationUrl('google');

      const state1 = new URL(url1).searchParams.get('state');
      const state2 = new URL(url2).searchParams.get('state');

      expect(state1).not.toBe(state2);

      // both must exist independently in Redis
      const keys = await redisClient.keys('oauth_state:*');
      expect(keys).toHaveLength(2);
    });

    it('github state stores provider value as github', async () => {
      const url = await service.getAuthorizationUrl('github');
      const state = new URL(url).searchParams.get('state')!;

      const stored = await redisClient.get(`oauth_state:${state}`);
      expect(stored).toBe('github');
    });
  });

  // ── handleCallback ───────────────────────────────────────────────────────

  describe('handleCallback', () => {
    const mockUser = { id: 'user-123', email: 'test@gmail.com', role: 'user' };

    // plant a state key directly into real Redis — simulates what getAuthorizationUrl did
    const seedState = (state: string, provider: string) =>
      redisClient.set(`oauth_state:${state}`, provider, 'EX', 600);

    const setupAxios = () => {
      mockedAxios.post.mockResolvedValue({
        data: { access_token: 'google-access-token' },
      });
      mockedAxios.get.mockResolvedValue({
        data: {
          id: 'google-user-id',
          email: 'test@gmail.com',
          name: 'Test User',
          picture: 'https://photo.url',
        },
      });
      mockUsersService.findOrCreate.mockResolvedValue(mockUser);
    };

    it('state key is deleted from Redis after successful callback — cannot be reused', async () => {
      await seedState('my-state', 'google');
      setupAxios();

      await service.handleCallback('google', 'auth-code', 'my-state');

      const remaining = await redisClient.get('oauth_state:my-state');
      expect(remaining).toBeNull();
    });

    it('session is stored in Redis with correct structure', async () => {
      await seedState('my-state', 'google');
      setupAxios();

      const { sessionToken } = await service.handleCallback(
        'google',
        'auth-code',
        'my-state',
      );

      const raw = await redisClient.get(`session:${sessionToken}`);
      expect(raw).not.toBeNull();

      const parsed = JSON.parse(raw!);
      expect(parsed.userId).toBe('user-123');
      expect(parsed.email).toBe('test@gmail.com');
      expect(parsed.role).toBe('user');
    });

    it('session TTL [Time To Live] is set to 7 days', async () => {
      await seedState('my-state', 'google');
      setupAxios();

      const { sessionToken } = await service.handleCallback(
        'google',
        'auth-code',
        'my-state',
      );

      const ttl = await redisClient.ttl(`session:${sessionToken}`);
      const sevenDays = 60 * 60 * 24 * 7;

      expect(ttl).toBeGreaterThan(sevenDays - 5);
      expect(ttl).toBeLessThanOrEqual(sevenDays);
    });

    it('throws BadRequestException when state key does not exist in Redis', async () => {
      // nothing seeded — expired or never existed
      await expect(
        service.handleCallback('google', 'auth-code', 'ghost-state'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when state belongs to different provider — state key survives', async () => {
      await seedState('my-state', 'github'); // state is for github, callback claims google

      await expect(
        service.handleCallback('google', 'auth-code', 'my-state'),
      ).rejects.toThrow(BadRequestException);

      // state was NOT deleted — validation failed before del was called
      const remaining = await redisClient.get('oauth_state:my-state');
      expect(remaining).toBe('github');
    });

    it('throws InternalServerErrorException when token exchange fails', async () => {
      await seedState('my-state', 'google');
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      await expect(
        service.handleCallback('google', 'auth-code', 'my-state'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('session key is actually removed from Redis', async () => {
      // plant a session manually
      await redisClient.set(
        'session:test-token',
        JSON.stringify({ userId: 'user-123' }),
      );

      await service.logout('test-token');

      const result = await redisClient.get('session:test-token');
      expect(result).toBeNull();
    });

    it('does not throw when session does not exist', async () => {
      // nothing seeded — should silently succeed, not crash
      await expect(service.logout('ghost-token')).resolves.not.toThrow();
    });
  });

  // ── validateSession ──────────────────────────────────────────────────────

  describe('validateSession', () => {
    it('returns parsed session when key exists in Redis', async () => {
      const sessionData = {
        userId: 'user-123',
        email: 'test@gmail.com',
        role: 'user',
      };
      await redisClient.set('session:valid-token', JSON.stringify(sessionData));

      const result = await service.validateSession('valid-token');
      expect(result).toEqual(sessionData);
    });

    it('returns null when session does not exist in Redis', async () => {
      const result = await service.validateSession('ghost-token');
      expect(result).toBeNull();
    });

    it('returns null and deletes corrupted session key', async () => {
      await redisClient.set('session:bad-token', 'not-valid-json{{{');

      const result = await service.validateSession('bad-token');
      expect(result).toBeNull();

      // corrupted key must be cleaned up — not left rotting in Redis
      const remaining = await redisClient.get('session:bad-token');
      expect(remaining).toBeNull();
    });

    it('returns null for a session whose TTL has expired — real Redis expiry', async () => {
      // this test is only meaningful with real Redis — unit test fakes this
      const sessionData = {
        userId: 'user-123',
        email: 'test@gmail.com',
        role: 'user',
      };
      await redisClient.set(
        'session:expiring-token',
        JSON.stringify(sessionData),
        'EX',
        1, // 1 second TTL
      );

      await new Promise((r) => setTimeout(r, 1500)); // wait for Redis to expire it

      const result = await service.validateSession('expiring-token');
      expect(result).toBeNull();
    });
  });
});
