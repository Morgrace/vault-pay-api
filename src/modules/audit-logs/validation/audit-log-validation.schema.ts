import z from 'zod';

export const auditLogRowSchema = z.object({
  entityType: z.string().max(100),
  entityId: z.uuid(),
  event: z.string().max(255),
  actorType: z.string().max(50),
  actorId: z.uuid().nullable(),
  previousState: z.any().nullable(),
  newState: z.any().nullable(),
  metadata: z.any().nullable(),
});
export type TAuditLogRowDto = z.infer<typeof auditLogRowSchema>;
export const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
});
export type TAuditLogQuery = z.infer<typeof auditLogQuerySchema>;
