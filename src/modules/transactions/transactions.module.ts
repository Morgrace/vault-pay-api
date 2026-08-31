import { Module } from '@nestjs/common';
import { TransactionRepository } from './repositories/transactions.repositories';
import { TransactionsService } from './services/transactions.service';
import { OrdersModule } from '../orders/orders.module';
@Module({
  providers: [TransactionRepository, TransactionsService],
  exports: [TransactionsService],
  imports: [OrdersModule],
})
export class TransactionsModule {}
