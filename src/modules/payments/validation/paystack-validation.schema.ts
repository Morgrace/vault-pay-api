import z from 'zod';
export const paystackWebhookSchema = z
  .object({
    event: z.string().min(1),
    data: z
      .object({
        reference: z.string().min(1).optional(),
        id: z.union([z.string(), z.number()]).optional(),
        amount: z.number().optional(),
        status: z.string().optional(),
      })
      .loose(), // don't reject on fields you don't know about
  })
  .loose();
export type TPaystackWebhookDto = z.infer<typeof paystackWebhookSchema>;
