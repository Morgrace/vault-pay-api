import {
  PLAN_CURRENCY_VALUES,
  TRANSACTION_STATUS_VALUES,
} from 'src/shared/database/schema';
import z from 'zod';
const transactionsBaseSchema = z.object({
  currency: z.enum(PLAN_CURRENCY_VALUES),
  amount: z.number().int().positive(),
  failureReason: z.string().max(255).optional(),
  gatewayResponse: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  orderId: z.uuid(),
  gatewayReference: z.string(),
  gatewayProvider: z.string(),
  status: z.enum(TRANSACTION_STATUS_VALUES),
});
export const createTransactionsSchema = transactionsBaseSchema.pick({
  amount: true,
  currency: true,
  orderId: true,
});
export type TCreateTransactionsDto = z.infer<typeof createTransactionsSchema>;

export const updateTransactionsSchema = transactionsBaseSchema
  .pick({
    status: true,
    failureReason: true,
    gatewayResponse: true,
    gatewayReference: true,
    gatewayProvider: true,
    metadata: true,
  })
  .partial()
  .refine((data) => data.status !== 'failed' || !!data.failureReason, {
    message: 'failureReason is required when status is failed',
  });
export type TUpdateTransactionDto = z.infer<typeof updateTransactionsSchema>;

export const listTransactionsQuerySchema = transactionsBaseSchema
  .pick({
    status: true,
    gatewayReference: true,
    orderId: true,
  })
  .partial()
  .extend({
    limit: z.coerce.number().int().positive().min(1).max(100).default(25),
    page: z.coerce.number().int().positive().default(1),
  });

export type TListTransactionQuery = z.infer<typeof listTransactionsQuerySchema>;
