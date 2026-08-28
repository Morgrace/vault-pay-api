import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ArticlesService } from 'src/modules/articles/services/articles.service';
import { AuditLogsService } from 'src/modules/audit-logs/services/audit-logs.service';
import { ORDER_STATUS_VALUES } from 'src/shared/database/schema';
import { OrdersRepository } from '../repositories/orders.repository';
import {
  createOrderSchema,
  updateOrderSchema,
} from '../validation/orders-validation.schema';
import { ISessionData } from 'src/modules/auth/auth.interface';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepo: OrdersRepository,
    private readonly articleService: ArticlesService,
    private readonly auditLogService: AuditLogsService,
  ) {}

  async create(
    dto: unknown,
    actor: string,
    currentUser?: ISessionData,
    ip?: string,
  ) {
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
      await this.auditLogService.append(
        {
          entityType: 'order',
          entityId: order.id,
          event: 'order.created',
          actorType: actor,
          actorId: currentUser?.userId,
          newState: order,
          ipAddress: ip,
        },
        tx,
      );
      return order;
    });
  }

  async updateStatus(
    id: string,
    status: (typeof ORDER_STATUS_VALUES)[number],
    actor: string,
    currentUser?: ISessionData,
    ip?: string,
  ) {
    const parsed = updateOrderSchema.safeParse({ status });

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
          actorType: actor,
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
  }
}
