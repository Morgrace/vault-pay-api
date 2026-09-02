import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ArticlesService } from 'src/modules/articles/services/articles.service';
import { AuditLogsService } from 'src/modules/audit-logs/services/audit-logs.service';
import { ISessionData } from 'src/modules/auth/auth.interface';
import { ORDER_STATUS_VALUES } from 'src/shared/database/schema';
import z from 'zod';
import { OrdersRepository } from '../repositories/orders.repository';
import {
  createOrderSchema,
  listOrdersQuerySchema,
} from '../validation/orders-validation.schema';
import { TransactionsService } from 'src/modules/transactions/services/transactions.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepo: OrdersRepository,
    private readonly articleService: ArticlesService,
    private readonly auditLogService: AuditLogsService,
    private readonly transactionsService: TransactionsService,
  ) {}

  async create(dto: unknown, currentUser?: ISessionData, ip?: string) {
    const parsed = await createOrderSchema.safeParseAsync(dto);

    if (!parsed.success) {
      throw new UnprocessableEntityException(parsed.error, 'Validation failed');
    }

    if (parsed.data.articleId) {
      await this.assertArticleExists(parsed.data.articleId);
    }

    // asert if plan exists when plan service is ready;

    return this.ordersRepo.transaction(async (tx) => {
      const order = await this.ordersRepo.create(parsed.data, tx);
      if (!order) {
        throw new InternalServerErrorException(
          'Order creation failed unexpectedly',
        );
      }

      await this.transactionsService.create(
        {
          amount: order.amount,
          currency: order.currency,
          orderId: order.id,
        },
        tx,
      );

      await this.auditLogService.append(
        {
          entityType: 'order',
          entityId: order.id,
          event: 'order.created',
          actorType: currentUser?.userId ? 'user' : 'system',
          actorId: currentUser?.userId,
          newState: order,
          ipAddress: ip,
        },
        tx,
      );
      return order;
    });
  }

  async findAll(query: unknown) {
    const parsed = listOrdersQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new UnprocessableEntityException(parsed.error, 'Validation failed');
    }
    return this.ordersRepo.findAll(parsed.data);
  }

  findById(id: string) {
    return this.ordersRepo.findById(id);
  }

  async updateStatus(
    id: string,
    status: (typeof ORDER_STATUS_VALUES)[number],
    currentUser?: ISessionData,
    ip?: string,
  ) {
    const parsed = z
      .object({ status: z.enum(ORDER_STATUS_VALUES) })
      .safeParse({ status });

    if (!parsed.success) {
      throw new UnprocessableEntityException(parsed.error, 'Validation failed');
    }

    return this.ordersRepo.transaction(async (tx) => {
      const order = await this.ordersRepo.update(id, { status }, tx);
      if (!order) {
        throw new NotFoundException(`Order ${id} not found`);
      }
      await this.auditLogService.append(
        {
          entityType: 'order',
          entityId: order.id,
          event: 'order.updated',
          actorType: currentUser?.userId ? 'user' : 'system',
          actorId: currentUser?.userId,
          newState: order,
          ipAddress: ip,
        },
        tx,
      );
      return order;
    });
  }

  private async assertArticleExists(articleId: string): Promise<void> {
    const article = await this.articleService.findById(articleId);
    if (!article) {
      throw new NotFoundException(`Article ${articleId} not found`);
    }
    if (article.isFree) {
      throw new BadRequestException(`Article ${articleId} is free`);
    }

    if (!article.publishedAt) {
      throw new BadRequestException(
        `Article ${articleId} has not been published yet`,
      );
    }
  }
}
