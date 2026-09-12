import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { appConfig } from 'src/config';
import {
  IPaymentVerificationResponse,
  IRefundRequest,
  IRefundResponse,
} from '../../payments.interface';
import type {
  PaystackRefundResponse,
  PaystackVerifyTransactionResponse,
} from '../../paystack.types';
import { BasePaymentProvider } from '../base/base.payment.provider';

@Injectable()
export class PaystackProvider extends BasePaymentProvider {
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly secretKey = appConfig.paystack.secretKey;
  private readonly baseUrl = 'https://api.paystack.co';

  async verifyPayment(
    reference: string,
  ): Promise<IPaymentVerificationResponse> {
    try {
      const { data } = await axios.get<PaystackVerifyTransactionResponse>(
        `${this.baseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      const tx = data.data;

      return {
        success: tx.status === 'success',
        status: tx.status,
        amount: tx.amount,
        reference: tx.reference,
        paidAt: tx.paid_at ? new Date(tx.paid_at) : undefined,
        channel: tx.channel,
        currency: tx.currency,
        raw: tx,
      };
    } catch (error) {
      this.logger.error(`Failed to verify payment ${reference}`, error);

      return {
        success: false,
        status: 'pending',
        amount: 0,
        reference,
      };
    }
  }

  async initiateRefund(request: IRefundRequest): Promise<IRefundResponse> {
    try {
      const payload: Record<string, unknown> = {
        transaction: request.reference,
      };

      if (request.amount) {
        payload.amount = request.amount;
      }

      if (request.reason) {
        payload.customer_note = request.reason;
      }

      const { data } = await axios.post<PaystackRefundResponse>(
        `${this.baseUrl}/refund`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        success: data.status,
        refundId: data.data?.id?.toString(),
        status: data.data?.status ?? 'pending',
        amount: data.data?.amount ?? 0,
        message: data.message,
      };
    } catch (error) {
      this.logger.error(
        `Failed to initiate refund for ${request.reference}`,
        error,
      );

      return {
        success: false,
        status: 'failed',
        amount: 0,
        message: error instanceof Error ? error.message : 'Refund failed',
      };
    }
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const hash = crypto
      .createHmac('sha512', this.secretKey!)
      .update(rawBody)
      .digest('hex');

    const hashBuffer = Buffer.from(hash, 'utf-8');
    const signatureBuffer = Buffer.from(signature, 'utf-8');

    if (hashBuffer.length !== signatureBuffer.length) return false;

    return crypto.timingSafeEqual(hashBuffer, signatureBuffer);
  }
}
