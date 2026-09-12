import { Injectable, Logger } from '@nestjs/common';
import { PaymentsService } from 'src/modules/payments/services/payments.service';
import { TransactionsService } from 'src/modules/transactions/services/transactions.service';
import { OrdersService } from 'src/modules/orders/services/orders.service';
import { ArticlesService } from 'src/modules/articles/services/articles.service';
import { ArticlesMailService } from 'src/modules/articles/services/articles-mail.service';
import { WebhookEventsService } from 'src/modules/webhook-events/services/webhook-events.service';
import { AuditLogsService } from 'src/modules/audit-logs/services/audit-logs.service';
import type {
  PaystackTransaction,
  PaystackWebhookEvent,
  PaystackRefundWebhookData,
} from 'src/modules/payments/paystack.types';
import { WebhookProcessingError } from '../errors/webhook-processing.error';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly transactionsService: TransactionsService,
    private readonly ordersService: OrdersService,
    private readonly articlesService: ArticlesService,
    private readonly articlesMailService: ArticlesMailService,
    private readonly webhookEventsService: WebhookEventsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ─── Ingest (called by controller) ─────────────────────────────────────

  async ingest(
    eventType: string,
    reference: string,
    payload: unknown,
  ): Promise<boolean> {
    return this.webhookEventsService.ingest(eventType, reference, payload);
  }

  // ─── Process Event (called by poller) ──────────────────────────────────

  async processEvent(
    eventType: PaystackWebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (eventType === 'charge.success') {
      await this.processChargeSuccess(payload.data as PaystackTransaction);
    } else if (eventType === 'refund.processed') {
      await this.processRefundProcessed(
        payload.data as PaystackRefundWebhookData,
      );
    } else {
      this.logger.log(`Unhandled webhook event type: ${eventType}`);
    }
  }

  // ─── Charge Success Handler ────────────────────────────────────────────

  private async processChargeSuccess(tx: PaystackTransaction): Promise<void> {
    const reference = tx.reference;

    // 1. Verify with Paystack API (never trust webhook payload alone)
    const verification = await this.paymentsService.verifyPayment(reference);
    if (!verification.success) {
      throw new WebhookProcessingError(
        `Paystack verification failed for ${reference}`,
        true, // retryable — might be a transient network issue
      );
    }

    // 2. Amount mismatch — not retryable, needs human
    if (verification.amount !== tx.amount) {
      throw new WebhookProcessingError(
        `Amount mismatch for ${reference}: webhook=${tx.amount}, verified=${verification.amount}`,
        false,
      );
    }

    // 3. Find transaction by gateway reference
    const { items: transactions } = await this.transactionsService.find({
      gatewayReference: reference,
      limit: 1,
      page: 1,
    });

    if (transactions.length === 0) {
      throw new WebhookProcessingError(
        `No transaction found for reference ${reference}`,
        false, // retryable — might be a race condition - turned it to false... as it can't be true the order is created same time transaction is created...
      );
    }

    const transaction = transactions[0];

    // 4. Find order
    const order = await this.ordersService.findById(transaction.orderId);
    if (!order) {
      throw new WebhookProcessingError(
        `Order ${transaction.orderId} not found`,
        false,
      );
    }

    // 5. Idempotency on ORDER status (not transaction status)
    if (order.status === 'success') {
      this.logger.log(`Order ${order.id} already success, skipping`);
      return; // not an error — just a no-op
    }

    // 6. Atomic: update transaction + audit log + update order in ONE transaction
    await this.ordersService.transaction(async (dbTx) => {
      await this.transactionsService.update(
        transaction.id,
        {
          status: 'success',
          gatewayProvider: 'paystack',
          gatewayResponse: verification.raw
            ? { gateway_response: verification.raw.gateway_response }
            : undefined,
        },
        dbTx,
      );

      await this.auditLogsService.append(
        {
          entityType: 'transaction',
          entityId: transaction.id,
          event: 'payment.success',
          actorType: 'system',
          actorId: null,
          newState: { status: 'success', reference },
          ipAddress: null,
        },
        dbTx,
      );

      await this.ordersService.updateStatus(
        order.id,
        'success',
        undefined,
        undefined,
        dbTx,
      );
    });

    // 7. Email — best-effort, outside the transaction
    if (order.articleId) {
      try {
        const article = await this.articlesService.findById(order.articleId);
        if (article) {
          const articleUrl = `${process.env.CLIENT_URL ?? 'http://localhost:3000'}/articles/${article.id}`;
          await this.articlesMailService.sendArticlePurchaseEmail(
            order.email,
            article,
            order,
            articleUrl,
          );
        }
      } catch (err) {
        this.logger.error(
          `Payment succeeded but email failed for order ${order.id}`,
          err,
        );
        // Don't throw — payment is correctly recorded, email can be resent manually
      }
    }

    this.logger.log(`Payment processed successfully for order ${order.id}`);
  }

  // ─── Refund Processed Handler ──────────────────────────────────────────

  private async processRefundProcessed(
    data: PaystackRefundWebhookData,
  ): Promise<void> {
    const reference = data.transaction_reference;

    // 1. Find transaction
    const { items: transactions } = await this.transactionsService.find({
      gatewayReference: reference,
      limit: 1,
      page: 1,
    });

    if (transactions.length === 0) {
      throw new WebhookProcessingError(
        `No transaction found for refund reference ${reference}`,
        true,
      );
    }

    const transaction = transactions[0];

    // 2. Verify with Paystack API
    const verification = await this.paymentsService.verifyPayment(reference);
    if (verification.status !== 'reversed') {
      throw new WebhookProcessingError(
        `Refund verification failed for ${reference}: Paystack status is ${verification.status}`,
        true, // retryable — Paystack might not have updated yet
      );
    }

    // 3. Find order
    const order = await this.ordersService.findById(transaction.orderId);
    if (!order) {
      throw new WebhookProcessingError(
        `Order ${transaction.orderId} not found for refund`,
        true,
      );
    }

    // 4. Idempotency
    if (order.status === 'refunded') {
      this.logger.log(`Order ${order.id} already refunded, skipping`);
      return;
    }

    // 5. Atomic: update order + audit log in one transaction
    await this.ordersService.transaction(async (dbTx) => {
      await this.ordersService.updateStatus(
        order.id,
        'refunded',
        undefined,
        undefined,
        dbTx,
      );

      await this.auditLogsService.append(
        {
          entityType: 'order',
          entityId: order.id,
          event: 'refund.completed',
          actorType: 'system',
          actorId: null,
          newState: {
            status: 'refunded',
            refundReference: data.refund_reference,
          },
          ipAddress: null,
        },
        dbTx,
      );
    });

    this.logger.log(`Refund processed for order ${order.id}`);
  }
}
