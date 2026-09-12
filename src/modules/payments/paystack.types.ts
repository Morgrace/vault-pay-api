// Paystack API Types
// Reference: https://paystack.com/docs/api/

// ─── Enums ───────────────────────────────────────────────────────────────────

export const PAYSTACK_TRANSACTION_STATUS = [
  'success',
  'failed',
  'abandoned',
  'ongoing',
  'pending',
  'processing',
  'queued',
  'reversed',
] as const;
export type PaystackTransactionStatus =
  (typeof PAYSTACK_TRANSACTION_STATUS)[number];

export const PAYSTACK_REFUND_STATUS = [
  'pending',
  'processing',
  'needs-attention',
  'failed',
  'processed',
] as const;
export type PaystackRefundStatus = (typeof PAYSTACK_REFUND_STATUS)[number];

export const PAYSTACK_CHANNEL = [
  'card',
  'bank',
  'bank_transfer',
  'ussd',
  'qr',
  'mobile_money',
  'eft',
  'apple_pay',
] as const;
export type PaystackChannel = (typeof PAYSTACK_CHANNEL)[number];

export const PAYSTACK_WEBHOOK_EVENT = [
  'charge.success',
  'charge.dispute.create',
  'charge.dispute.remind',
  'charge.dispute.resolve',
  'customeridentification.failed',
  'customeridentification.success',
  'dedicatedaccount.assign.failed',
  'dedicatedaccount.assign.success',
  'invoice.create',
  'invoice.payment_failed',
  'invoice.update',
  'paymentrequest.pending',
  'paymentrequest.success',
  'refund.failed',
  'refund.pending',
  'refund.processed',
  'refund.processing',
  'subscription.create',
  'subscription.disable',
  'subscription.expiring_cards',
  'subscription.not_renew',
  'transfer.failed',
  'transfer.success',
  'transfer.reversed',
] as const;
export type PaystackWebhookEvent = (typeof PAYSTACK_WEBHOOK_EVENT)[number];

// ─── Shared Objects ──────────────────────────────────────────────────────────

export interface PaystackAuthorization {
  authorization_code: string;
  bin: string;
  last4: string;
  exp_month: string;
  exp_year: string;
  channel: string;
  card_type: string;
  bank: string;
  country_code: string;
  brand: string;
  reusable: boolean;
  signature: string;
  account_name: string | null;
}

export interface PaystackCustomer {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  customer_code: string;
  phone: string | null;
  metadata: Record<string, unknown> | null;
  risk_action: string;
  international_format_phone: string | null;
}

export interface PaystackLogHistory {
  type: string;
  message: string;
  time: number;
}

export interface PaystackLog {
  start_time: number;
  time_spent: number;
  attempts: number;
  errors: number;
  success: boolean;
  mobile: boolean;
  input: unknown[];
  history: PaystackLogHistory[];
}

// ─── Transaction ─────────────────────────────────────────────────────────────

export interface PaystackTransaction {
  id: number;
  domain: 'test' | 'live';
  status: PaystackTransactionStatus;
  reference: string;
  receipt_number: string | null;
  amount: number;
  message: string | null;
  gateway_response: string;
  paid_at: string | null;
  created_at: string;
  channel: PaystackChannel;
  currency: string;
  ip_address: string;
  metadata: unknown;
  log: PaystackLog | null;
  fees: number;
  fees_split: unknown | null;
  authorization: PaystackAuthorization;
  customer: PaystackCustomer;
  plan: Record<string, unknown> | null;
  split: Record<string, unknown>;
  order_id: string | null;
  paidAt: string | null;
  createdAt: string;
  requested_amount: number;
  pos_transaction_data: unknown | null;
  source: unknown | null;
  fees_breakdown: unknown | null;
  connect: unknown | null;
  transaction_date: string;
  plan_object: Record<string, unknown>;
  subaccount: Record<string, unknown>;
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface PaystackVerifyTransactionResponse {
  status: boolean;
  message: string;
  data: PaystackTransaction;
}

export interface PaystackRefundTransaction {
  id: number;
  domain: string;
  reference: string;
  amount: number;
  paid_at: string;
  channel: string;
  currency: string;
  authorization: Partial<PaystackAuthorization>;
  customer: Partial<PaystackCustomer>;
  plan: Record<string, unknown>;
  subaccount: Record<string, unknown>;
  split: Record<string, unknown>;
  order_id: string | null;
  paidAt: string;
  pos_transaction_data: unknown | null;
  source: unknown | null;
  fees_breakdown: unknown | null;
}

export interface PaystackRefundData {
  transaction: PaystackRefundTransaction;
  integration: number;
  deducted_amount: number;
  channel: string | null;
  merchant_note: string;
  customer_note: string;
  status: PaystackRefundStatus;
  refunded_by: string;
  expected_at: string;
  currency: string;
  domain: string;
  amount: number;
  fully_deducted: boolean;
  id: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaystackRefundResponse {
  status: boolean;
  message: string;
  data: PaystackRefundData;
}

// ─── Webhook Event Payloads ──────────────────────────────────────────────────

export interface PaystackWebhookPayload<T = unknown> {
  event: PaystackWebhookEvent;
  data: T;
}

export interface PaystackRefundWebhookData {
  status: PaystackRefundStatus;
  transaction_reference: string;
  refund_reference: string | null;
  amount: string;
  currency: string;
  processor: string;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  };
  integration: number;
  domain: 'test' | 'live';
}

export type PaystackChargeSuccessWebhook = PaystackWebhookPayload<PaystackTransaction>;
export type PaystackRefundProcessedWebhook = PaystackWebhookPayload<PaystackRefundWebhookData>;
export type PaystackRefundFailedWebhook = PaystackWebhookPayload<PaystackRefundWebhookData>;
export type PaystackRefundPendingWebhook = PaystackWebhookPayload<PaystackRefundWebhookData>;
