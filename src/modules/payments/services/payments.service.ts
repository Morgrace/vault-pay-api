import { Injectable, Logger } from '@nestjs/common';
import { PaystackProvider } from '../providers/paystack/paystack.provider';
import {
  IPaymentVerificationResponse,
  IRefundRequest,
  IRefundResponse,
} from '../payments.interface';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly paystackProvider: PaystackProvider) {}

  async verifyPayment(
    reference: string,
  ): Promise<IPaymentVerificationResponse> {
    return this.paystackProvider.verifyPayment(reference);
  }

  async initiateRefund(request: IRefundRequest): Promise<IRefundResponse> {
    return this.paystackProvider.initiateRefund(request);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    return this.paystackProvider.verifyWebhookSignature(rawBody, signature);
  }
}
