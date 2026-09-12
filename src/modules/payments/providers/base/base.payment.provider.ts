import {
  IPaymentVerificationResponse,
  IRefundRequest,
  IRefundResponse,
} from '../../payments.interface';

export abstract class BasePaymentProvider {
  abstract verifyPayment(
    reference: string,
  ): Promise<IPaymentVerificationResponse>;
  abstract initiateRefund(request: IRefundRequest): Promise<IRefundResponse>;
  abstract verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}
