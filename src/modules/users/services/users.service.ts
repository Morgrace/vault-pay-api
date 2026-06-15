import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
    const existingByProvider = await this.usersRepo.findByProvider(
      data.provider,
      data.providerId,
    );
    if (existingByProvider) return existingByProvider;

    const existingByEmail = await this.usersRepo.findByEmail(data.email);
    if (existingByEmail) {
      // email exists but under a different provider — do not create, do not merge
      throw new ConflictException(
        `This email is already registered via ${existingByEmail.provider}. Please sign in with ${existingByEmail.provider} instead.`,
      );
    }
    const newUser = await this.usersRepo.createUser(data);
    this.logger.log(
      `New user created: ${newUser.id} (${newUser.email}) via ${data.provider}`,
    );
    return newUser;
  }
}
