import type {
  PaystackChannel,
  PaystackRefundStatus,
  PaystackTransaction,
  PaystackTransactionStatus,
} from './paystack.types';

export interface IPaymentVerificationResponse {
  success: boolean;
  status: PaystackTransactionStatus;
  amount: number;
  reference: string;
  paidAt?: Date;
  channel?: PaystackChannel;
  currency?: string;
  raw?: PaystackTransaction;
}

export interface IRefundRequest {
  reference: string;
  amount?: number;
  reason?: string;
}

export interface IRefundResponse {
  success: boolean;
  refundId?: string;
  status: PaystackRefundStatus;
  amount: number;
  message?: string;
}
