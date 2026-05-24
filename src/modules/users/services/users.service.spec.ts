import { Test, TestingModule } from '@nestjs/testing';
import { Logger, NotFoundException } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import { UsersService } from './users.service';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-uuid-123',
  email: 'test@gmail.com',
  fullName: 'Test User',
  avatarUrl: 'https://photo.url',
  provider: 'google',
  providerId: 'google-123',
  role: 'user' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUsersRepository = {
  findByEmail: jest.fn(),
  findByProvider: jest.fn(),
  createUser: jest.fn(),
  findAll: jest.fn(),
};

// ─── Test Suite ──────────────────────────────────────────────────────────────
jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: mockUsersRepository },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  // ── findByEmail ────────────────────────────────────────────────────────────

  describe('findByEmail', () => {
    it('returns user when found', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@gmail.com');

      expect(result).toEqual(mockUser);
      expect(mockUsersRepository.findByEmail).toHaveBeenCalledWith(
        'test@gmail.com',
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(null);

      await expect(service.findByEmail('ghost@gmail.com')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException with correct message', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(null);

      await expect(service.findByEmail('ghost@gmail.com')).rejects.toThrow(
        'User not found',
      );
    });
  });

  // ── findByProvider ─────────────────────────────────────────────────────────

  describe('findByProvider', () => {
    it('returns user when found', async () => {
      mockUsersRepository.findByProvider.mockResolvedValue(mockUser);

      const result = await service.findByProvider('google', 'google-123');

      expect(result).toEqual(mockUser);
      expect(mockUsersRepository.findByProvider).toHaveBeenCalledWith(
        'google',
        'google-123',
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockUsersRepository.findByProvider.mockResolvedValue(null);

      await expect(
        service.findByProvider('google', 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── createUser ─────────────────────────────────────────────────────────────

  describe('createUser', () => {
    const createData = {
      email: 'new@gmail.com',
      fullName: 'New User',
      avatarUrl: 'https://photo.url',
      provider: 'google',
      providerId: 'google-456',
    };

    it('creates and returns new user', async () => {
      const newUser = { ...mockUser, ...createData, id: 'new-uuid' };
      mockUsersRepository.createUser.mockResolvedValue(newUser);

      const result = await service.createUser(createData);

      expect(result).toEqual(newUser);
      expect(mockUsersRepository.createUser).toHaveBeenCalledWith(createData);
    });

    it('creates user with only required fields', async () => {
      const minimalData = {
        email: 'minimal@gmail.com',
        provider: 'github',
        providerId: 'github-789',
      };
      const newUser = { ...mockUser, ...minimalData };
      mockUsersRepository.createUser.mockResolvedValue(newUser);

      const result = await service.createUser(minimalData);

      expect(result).toEqual(newUser);
      expect(mockUsersRepository.createUser).toHaveBeenCalledWith(minimalData);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all users', async () => {
      const users = [
        mockUser,
        { ...mockUser, id: 'user-2', email: 'two@gmail.com' },
      ];
      mockUsersRepository.findAll.mockResolvedValue(users);

      const result = await service.findAll();

      expect(result).toEqual(users);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no users exist', async () => {
      mockUsersRepository.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ── findOrCreate ───────────────────────────────────────────────────────────

  describe('findOrCreate', () => {
    const userData = {
      email: 'test@gmail.com',
      fullName: 'Test User',
      avatarUrl: 'https://photo.url',
      provider: 'google',
      providerId: 'google-123',
    };

    it('returns existing user when found — does not create', async () => {
      mockUsersRepository.findByProvider.mockResolvedValue(mockUser);

      const result = await service.findOrCreate(userData);

      expect(result).toEqual(mockUser);
      expect(mockUsersRepository.findByProvider).toHaveBeenCalledWith(
        'google',
        'google-123',
      );
      // critical — must NOT create if user exists
      expect(mockUsersRepository.createUser).not.toHaveBeenCalled();
    });

    it('creates and returns new user when not found', async () => {
      const newUser = { ...mockUser, id: 'brand-new-uuid' };
      mockUsersRepository.findByProvider.mockResolvedValue(null);
      mockUsersRepository.createUser.mockResolvedValue(newUser);

      const result = await service.findOrCreate(userData);

      expect(result).toEqual(newUser);
      expect(mockUsersRepository.createUser).toHaveBeenCalledWith(userData);
    });

    it('does not call createUser when user already exists', async () => {
      mockUsersRepository.findByProvider.mockResolvedValue(mockUser);

      await service.findOrCreate(userData);

      expect(mockUsersRepository.createUser).not.toHaveBeenCalled();
    });

    it('always checks by provider and providerId — not email', async () => {
      // two different Google accounts can theoretically share an email edge case
      // findOrCreate must identify by provider identity, not email
      mockUsersRepository.findByProvider.mockResolvedValue(null);
      mockUsersRepository.createUser.mockResolvedValue(mockUser);

      await service.findOrCreate(userData);

      expect(mockUsersRepository.findByProvider).toHaveBeenCalledWith(
        userData.provider,
        userData.providerId,
      );
      expect(mockUsersRepository.findByEmail).not.toHaveBeenCalled();
    });
  });
});
