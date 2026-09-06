import z from 'zod';
export const listWebhookEventsSchema = z.object({
  eventId: z.string().optional(),
  processed: z.stringbool().optional(),
  eventType: z.string().max(255).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
});
export type TListWebhookEvents = z.infer<typeof listWebhookEventsSchema>;

export const createWebhookEventsSchema = z.object({
  eventId: z.string().max(255),
  eventType: z.string().max(255),
  payload: z.record(z.string(), z.unknown()),
  processed: z.boolean().default(false),
  processedAt: z.coerce.date().optional(),
  error: z.string().optional(),
  lastAttempt: z.coerce.date().optional(),
  attempts: z.number().int().nonnegative().default(0),
});
export type TCreateWebhookEventsDto = z.infer<typeof createWebhookEventsSchema>;

export const updateWebhookEventsSchema = createWebhookEventsSchema.pick({
  attempts: true,
  processed: true,
  lastAttempt: true,
  processedAt: true,
  error: true,
});
export type TUpdateWebhookEventsDto = z.infer<typeof updateWebhookEventsSchema>;
