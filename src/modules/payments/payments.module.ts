import { Module } from '@nestjs/common';
import { PaystackProvider } from './providers/paystack/paystack.provider';
import { PaymentsService } from './services/payments.service';

@Module({
  providers: [PaystackProvider, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
