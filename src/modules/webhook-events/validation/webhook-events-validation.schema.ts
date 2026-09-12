import { WEBHOOK_EVENT_STATUS_VALUES } from 'src/database/schema';
import z from 'zod';

export const listWebhookEventsSchema = z.object({
  reference: z.string().optional(),
  status: z.enum(WEBHOOK_EVENT_STATUS_VALUES).optional(),
  eventType: z.string().max(255).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
});
export type TListWebhookEvents = z.infer<typeof listWebhookEventsSchema>;

export const createWebhookEventsSchema = z.object({
  eventType: z.string().max(100),
  reference: z.string().max(255),
  payload: z.record(z.string(), z.unknown()),
  attempts: z.number().int().nonnegative().default(0),
});
export type TCreateWebhookEventsDto = z.infer<typeof createWebhookEventsSchema>;

export const updateWebhookEventsSchema = z.object({
  status: z.enum(WEBHOOK_EVENT_STATUS_VALUES).optional(),
  attempts: z.number().int().nonnegative().optional(),
  nextAttemptAt: z.coerce.date().optional(),
  lockedAt: z.coerce.date().nullable().optional(),
  lockedBy: z.string().max(100).nullable().optional(),
  lastError: z.string().nullable().optional(),
  processedAt: z.coerce.date().nullable().optional(),
});
export type TUpdateWebhookEventsDto = z.infer<typeof updateWebhookEventsSchema>;
