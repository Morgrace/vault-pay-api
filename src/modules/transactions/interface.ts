import {
  PLAN_CURRENCY_VALUES,
  TRANSACTION_STATUS_VALUES,
} from 'src/shared/database/schema';

export interface ITransaction {
  id: string;
  orderId: string;
  gatewayReference: string;
  gatewayProvider: string;
  status: (typeof TRANSACTION_STATUS_VALUES)[number];
  currency: (typeof PLAN_CURRENCY_VALUES)[number];
  amount: number;
  failureReason: string;
  gatewayResponse: any;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}
