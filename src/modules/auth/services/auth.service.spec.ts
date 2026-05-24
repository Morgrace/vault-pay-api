import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { RedisService } from 'src/shared/redis/redis.service';
import axios from 'axios';
import { UsersService } from '../../users/services/users.service';

// mock axios entirely — we don't want real HTTP in tests
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// ─── Helpers ────────────────────────────────────────────────────────────────

const mockRedisClient = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

const mockRedisService = {
  client: mockRedisClient,
};

const mockUsersService = {
  findOrCreate: jest.fn(),
};

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

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // reset all mocks before each test — no state leaking between tests
    jest.clearAllMocks();
  });

  // ── getAuthorizationUrl ──────────────────────────────────────────────────

  describe('getAuthorizationUrl', () => {
    it('returns a valid Google authorization URL with correct params', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      const url = await service.getAuthorizationUrl('google');
      const parsed = new URL(url);

      expect(parsed.origin + parsed.pathname).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(parsed.searchParams.get('client_id')).toBe('google-client-id');
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('scope')).toBe('email profile');
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3000/auth/google/callback',
      );
      // state must be present and non-empty
      expect(parsed.searchParams.get('state')).toBeTruthy();
    });

    it('returns a valid GitHub authorization URL with correct params', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      const url = await service.getAuthorizationUrl('github');
      const parsed = new URL(url);

      expect(parsed.origin + parsed.pathname).toBe(
        'https://github.com/login/oauth/authorize',
      );
      expect(parsed.searchParams.get('client_id')).toBe('github-client-id');
      expect(parsed.searchParams.get('scope')).toBe('user:email');
    });

    it('stores state in Redis with 10 minute TTL [Time To Live]', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await service.getAuthorizationUrl('google');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringMatching(/^oauth_state:/),
        'google',
        'EX',
        600,
      );
    });
  });

  // ── handleCallback ───────────────────────────────────────────────────────

  describe('handleCallback', () => {
    const mockUser = {
      id: 'user-uuid-123',
      email: 'test@gmail.com',
      role: 'user',
    };

    const setupSuccessfulGoogleCallback = () => {
      mockRedisClient.get.mockResolvedValue('google'); // state is valid
      mockRedisClient.del.mockResolvedValue(1);
      mockRedisClient.set.mockResolvedValue('OK');

      // token exchange response
      mockedAxios.post.mockResolvedValue({
        data: { access_token: 'google-access-token' },
      });

      // user info response
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

    it('returns sessionToken and user on successful Google callback', async () => {
      setupSuccessfulGoogleCallback();

      const result = await service.handleCallback(
        'google',
        'auth-code',
        'valid-state',
      );

      expect(result.sessionToken).toBeTruthy();
      expect(result.sessionToken.length).toBeGreaterThan(0);
      expect(result.user).toEqual(mockUser);
    });

    it('throws BadRequestException when state is invalid', async () => {
      mockRedisClient.get.mockResolvedValue(null); // state not found in Redis

      await expect(
        service.handleCallback('google', 'auth-code', 'invalid-state'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when state belongs to different provider', async () => {
      mockRedisClient.get.mockResolvedValue('github'); // state was for github

      await expect(
        service.handleCallback('google', 'auth-code', 'some-state'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deletes state from Redis after successful verification', async () => {
      setupSuccessfulGoogleCallback();

      await service.handleCallback('google', 'auth-code', 'valid-state');

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'oauth_state:valid-state',
      );
    });

    it('stores session in Redis with 7 day TTL', async () => {
      setupSuccessfulGoogleCallback();

      await service.handleCallback('google', 'auth-code', 'valid-state');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringMatching(/^session:/),
        expect.any(String),
        'EX',
        60 * 60 * 24 * 7,
      );
    });

    it('calls findOrCreate with correct user data from Google', async () => {
      setupSuccessfulGoogleCallback();

      await service.handleCallback('google', 'auth-code', 'valid-state');

      expect(mockUsersService.findOrCreate).toHaveBeenCalledWith({
        email: 'test@gmail.com',
        fullName: 'Test User',
        avatarUrl: 'https://photo.url',
        provider: 'google',
        providerId: 'google-user-id',
      });
    });

    it('throws InternalServerErrorException when token exchange fails', async () => {
      mockRedisClient.get.mockResolvedValue('google');
      mockRedisClient.del.mockResolvedValue(1);
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      await expect(
        service.handleCallback('google', 'auth-code', 'valid-state'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('deletes session from Redis', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await service.logout('some-session-token');

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'session:some-session-token',
      );
    });
  });

  // ── validateSession ──────────────────────────────────────────────────────

  describe('validateSession', () => {
    it('returns parsed session data when session exists', async () => {
      const sessionData = {
        userId: 'user-123',
        email: 'test@gmail.com',
        role: 'user',
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(sessionData));

      const result = await service.validateSession('valid-token');

      expect(result).toEqual(sessionData);
    });

    it('returns null when session does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.validateSession('nonexistent-token');

      expect(result).toBeNull();
    });

    it('returns null and deletes corrupted session', async () => {
      mockRedisClient.get.mockResolvedValue('not-valid-json{{{');
      mockRedisClient.del.mockResolvedValue(1);

      const result = await service.validateSession('corrupted-token');

      expect(result).toBeNull();
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'session:corrupted-token',
      );
    });
  });
});
