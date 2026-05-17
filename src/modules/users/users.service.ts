import { Injectable } from '@nestjs/common';
import { UsersRepository } from './repositories/users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepo: UsersRepository) {}

  async findByEmail(email: string) {
    return this.usersRepo.findByEmail(email);
  }
  async findByProvider(provider: string, providerId: string) {
    return this.usersRepo.findByProvider(provider, providerId);
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
}
