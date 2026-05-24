import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(private readonly usersRepo: UsersRepository) {}

  async findByEmail(email: string) {
    const user = await this.usersRepo.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
  async findByProvider(provider: string, providerId: string) {
    const user = await this.usersRepo.findByProvider(provider, providerId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async createUser(data: {
    email: string;
    fullName?: string;
    avatarUrl?: string;
    provider: string;
    providerId: string;
  }) {
    return this.usersRepo.createUser(data);
  }

  async findAll() {
    return this.usersRepo.findAll();
  }

  async findOrCreate(data: {
    email: string;
    fullName?: string;
    avatarUrl?: string;
    provider: string;
    providerId: string;
  }) {
    // call repo directly — a missing user here is not an error, we will create it if it doesn't exist
    const existing = await this.usersRepo.findByProvider(
      data.provider,
      data.providerId,
    );
    if (existing) return existing;
    const newUser = await this.usersRepo.createUser(data);
    this.logger.log(
      `New user created: ${newUser.id} (${newUser.email}) via ${data.provider}`,
    );
    return newUser;
  }
}
