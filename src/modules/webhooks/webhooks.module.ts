import { Module } from '@nestjs/common';
import { WebhooksController } from './controllers/webhooks.controller';
import { WebhooksService } from './services/webhooks.service';
import { PaymentsModule } from '../payments/payments.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { OrdersModule } from '../orders/orders.module';
import { ArticlesModule } from '../articles/articles.module';
import { WebhookEventsModule } from '../webhook-events/webhook-events.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    PaymentsModule,
    TransactionsModule,
    OrdersModule,
    ArticlesModule,
    WebhookEventsModule,
    AuditLogsModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
