import { Body, Controller, Get, Post } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list() {
    return this.usersService.findAll();
  }

  @Post()
  async create(@Body() body: any) {
    return this.usersService.createUser(body);
  }
}
