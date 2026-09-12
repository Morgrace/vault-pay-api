import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ArticlesService } from 'src/modules/articles/services/articles.service';
import { ArticlesMailService } from 'src/modules/articles/services/articles-mail.service';
import { AuditLogsService } from 'src/modules/audit-logs/services/audit-logs.service';
import { ISessionData } from 'src/modules/auth/auth.interface';
import { PaymentsService } from 'src/modules/payments/services/payments.service';
import { ORDER_STATUS_VALUES } from 'src/database/schema';
import { DbOrTx } from 'src/database/base.repository';
import z from 'zod';
import { OrdersRepository } from '../repositories/orders.repository';
import {
  createOrderSchema,
  listOrdersQuerySchema,
} from '../validation/orders-validation.schema';
import { TransactionsService } from 'src/modules/transactions/services/transactions.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly ordersRepo: OrdersRepository,
    private readonly articleService: ArticlesService,
    private readonly articlesMailService: ArticlesMailService,
    private readonly auditLogService: AuditLogsService,
    private readonly transactionsService: TransactionsService,
    private readonly paymentsService: PaymentsService,
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

  async transaction<R>(fn: (tx: DbOrTx) => Promise<R>): Promise<R> {
    return this.ordersRepo.transaction(fn);
  }

  async updateStatus(
    id: string,
    status: (typeof ORDER_STATUS_VALUES)[number],
    currentUser?: ISessionData,
    ip?: string,
    tx?: DbOrTx,
  ) {
    const parsed = z
      .object({ status: z.enum(ORDER_STATUS_VALUES) })
      .safeParse({ status });

    if (!parsed.success) {
      throw new UnprocessableEntityException(parsed.error, 'Validation failed');
    }

    const doUpdate = async (t: DbOrTx) => {
      const order = await this.ordersRepo.update(id, { status }, t);
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
        t,
      );
      return order;
    };

    if (tx) {
      return doUpdate(tx);
    }

    return this.ordersRepo.transaction(doUpdate);
  }

  async confirmPayment(reference: string, paymentData?: unknown) {
    if (!reference) {
      throw new BadRequestException('Reference is required');
    }

    // Find transaction by gateway reference
    const { items: transactions } = await this.transactionsService.find({
      gatewayReference: reference,
      limit: 1,
      page: 1,
    });

    if (transactions.length === 0) {
      throw new NotFoundException(`Transaction with reference ${reference} not found`);
    }

    const transaction = transactions[0];

    // Store Paystack SDK response metadata on the transaction
    if (paymentData && transaction.status === 'pending') {
      await this.transactionsService.update(transaction.id, {
        gatewayProvider: 'paystack',
        gatewayResponse: paymentData as Record<string, unknown>,
      });
    }

    // Get the order
    const order = await this.findById(transaction.orderId);
    if (!order) {
      throw new NotFoundException(`Order ${transaction.orderId} not found`);
    }

    return {
      orderId: order.id,
      status: order.status,
      transactionStatus: transaction.status,
    };
  }

  async verifyByReference(reference: string) {
    if (!reference) {
      throw new BadRequestException('Reference is required');
    }

    // Find transaction by gateway reference
    const { items: transactions } = await this.transactionsService.find({
      gatewayReference: reference,
      limit: 1,
      page: 1,
    });

    if (transactions.length === 0) {
      throw new NotFoundException(`Transaction with reference ${reference} not found`);
    }

    const transaction = transactions[0];
    const order = await this.findById(transaction.orderId);

    return {
      orderId: order?.id,
      status: order?.status,
      transactionStatus: transaction.status,
    };
  }

  async adminVerify(orderId: string) {
    const order = await this.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // Find transaction by orderId
    const { items: transactions } = await this.transactionsService.find({
      orderId: order.id,
      limit: 1,
      page: 1,
    });

    if (transactions.length === 0) {
      throw new NotFoundException(`No transaction found for order ${orderId}`);
    }

    const transaction = transactions[0];

    // Already processed?
    if (transaction.status === 'success') {
      return { message: 'Transaction already confirmed', order, transaction };
    }

    // No gateway reference yet — payment was never attempted
    if (!transaction.gatewayReference) {
      throw new BadRequestException('Transaction has no gateway reference — payment was never attempted');
    }

    // Verify with Paystack
    const verification = await this.paymentsService.verifyPayment(
      transaction.gatewayReference,
    );

    if (!verification.success) {
      return {
        message: 'Payment not confirmed by Paystack',
        paystackStatus: verification.status,
        order,
        transaction,
      };
    }

    // Process the payment — same logic as webhook
    await this.transactionsService.update(transaction.id, {
      status: 'success',
      gatewayProvider: 'paystack',
      gatewayResponse: verification.raw
        ? { gateway_response: verification.raw.gateway_response }
        : undefined,
    });

    // Send article email if applicable
    if (order.articleId) {
      const article = await this.articleService.findById(order.articleId);
      if (article) {
        const articleUrl = `${process.env.CLIENT_URL ?? 'http://localhost:3000'}/articles/${article.id}`;
        await this.articlesMailService.sendArticlePurchaseEmail(
          order.email,
          article,
          order,
          articleUrl,
        );
      }
    }

    // Update order status
    await this.updateStatus(order.id, 'success');

    // Audit log
    await this.auditLogService.append({
      entityType: 'order',
      entityId: order.id,
      event: 'payment.verified_manually',
      actorType: 'admin',
      actorId: null,
      newState: { status: 'success' },
      ipAddress: null,
    });

    return { message: 'Payment verified and processed', order };
  }

  async adminRefund(orderId: string, reason?: string) {
    const order = await this.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.status !== 'success') {
      throw new BadRequestException(`Can only refund successful orders, current status: ${order.status}`);
    }

    // Find transaction by orderId
    const { items: transactions } = await this.transactionsService.find({
      orderId: order.id,
      limit: 1,
      page: 1,
    });

    if (transactions.length === 0) {
      throw new NotFoundException(`No transaction found for order ${orderId}`);
    }

    const transaction = transactions[0];

    if (!transaction.gatewayReference) {
      throw new BadRequestException('Transaction has no gateway reference');
    }

    // Initiate refund via Paystack
    const refundResult = await this.paymentsService.initiateRefund({
      reference: transaction.gatewayReference,
      reason: reason ?? 'Admin initiated refund',
    });

    if (!refundResult.success) {
      throw new BadRequestException(`Refund failed: ${refundResult.message}`);
    }

    // Update order status to refunded
    await this.updateStatus(order.id, 'refunded');

    // Audit log
    await this.auditLogService.append({
      entityType: 'order',
      entityId: order.id,
      event: 'refund.initiated',
      actorType: 'admin',
      actorId: null,
      newState: { status: 'refunded', refundId: refundResult.refundId },
      ipAddress: null,
    });

    return {
      message: 'Refund initiated successfully',
      refundId: refundResult.refundId,
      status: refundResult.status,
    };
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
