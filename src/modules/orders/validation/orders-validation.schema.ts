import {
  ORDER_STATUS_VALUES,
  PLAN_CURRENCY_VALUES,
} from 'src/shared/database/schema';
import z from 'zod';

export const listOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
  articleId: z.uuid().optional(),
  planId: z.uuid().optional(),
  userId: z.uuid().optional(),
  status: z.enum(ORDER_STATUS_VALUES).optional(),
  valueDelivered: z.stringbool().optional(),
  deliveredAt: z.coerce.date().optional(),
  refundedAt: z.coerce.date().optional(),
});
export type TListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

const orderSchemaBase = z.object({
  email: z.email(),
  articleId: z.uuid().optional(),
  planId: z.uuid().optional(),
  amount: z.coerce.number().int(),
  currency: z.enum(PLAN_CURRENCY_VALUES),
  status: z.enum(ORDER_STATUS_VALUES).optional(),
});
export const createOrderSchema = orderSchemaBase
  .omit({ status: true })
  .refine((v) => Boolean(v.articleId) !== Boolean(v.planId), {
    error: 'order must be tied to exactly one of articleId or planId, not both',
  });
export type TCreateOrdersDto = z.infer<typeof createOrderSchema>;
export const updateOrderSchema = orderSchemaBase
  .omit({ amount: true })
  .partial();
export type TUpdateOrderDto = z.infer<typeof updateOrderSchema>;
