import { Module } from '@nestjs/common';
import { TransactionRepository } from './repositories/transactions.repositories';
import { TransactionsService } from './services/transactions.service';
@Module({
  providers: [TransactionRepository, TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
