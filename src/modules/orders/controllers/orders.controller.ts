import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from '../services/orders.service';
import type {
  TCreateOrdersDto,
  TListOrdersQuery,
} from '../validation/orders-validation.schema';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ISessionData } from 'src/modules/auth/auth.interface';
import { Public } from 'src/common/decorators/public.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Role, Roles } from 'src/common/decorators/roles.decorator';
import { ORDER_STATUS_VALUES } from 'src/shared/database/schema';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findAll(@Query() query: TListOrdersQuery) {
    return this.ordersService.findAll(query);
  }

  @Public()
  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findById(id);
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: TCreateOrdersDto,
    @Ip() ip: string,
    @CurrentUser() currentUser: ISessionData,
  ) {
    return this.ordersService.create(body, currentUser, ip);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: (typeof ORDER_STATUS_VALUES)[number],
    @Ip() ip: string,
    @CurrentUser() currentUser: ISessionData,
  ) {
    return this.ordersService.updateStatus(id, status, currentUser, ip);
  }
}
