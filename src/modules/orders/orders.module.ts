import { Module } from '@nestjs/common';
import { OrdersController } from './controllers/orders.controller';
import { OrdersService } from './services/orders.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { OrdersRepository } from './repositories/orders.repository';
import { ArticlesModule } from '../articles/articles.module';

@Module({
  controllers: [OrdersController],
  exports: [OrdersService],
  imports: [AuditLogsModule, ArticlesModule],
  providers: [OrdersRepository, OrdersService],
})
export class OrdersModule {}
