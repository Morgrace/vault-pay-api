import z from 'zod';

const articleFieldsSchema = z.object({
  title: z.string().min(3).max(500),
  content: z.string().min(50),
  coverImageUrl: z.url().optional(),
  isFree: z.boolean(),
  price: z.number().positive().optional(),
  currency: z.enum(['NGN', 'USD']).optional(),
});

export const createArticleSchema = articleFieldsSchema.refine(
  (data) =>
    data.isFree || (data.price !== undefined && data.currency !== undefined),
  {
    error: 'price and currency are required when isFree is false',
    path: ['price'],
  },
);
export type TCreateArticleDto = z.infer<typeof createArticleSchema>;

export const updateArticleSchema = articleFieldsSchema
  .partial()
  .refine(
    (data) =>
      data.isFree === undefined ||
      data.isFree === true ||
      (data.price !== undefined && data.currency !== undefined),
    {
      error: 'price and currency are required when setting isFree to false',
      path: ['price'],
    },
  );
export type TUpdateArticleDto = z.infer<typeof updateArticleSchema>;

//  QUERY PARAMS
export const listArticleQuerySchema = z
  .object({
    isFree: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    isPublished: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    maxPrice: z.coerce.number().int().optional(),
    minPrice: z.coerce.number().int().optional(),
    page: z.coerce.number().int().min(1).default(1),
    search: z.string().optional(),
  })
  .refine(
    (data) =>
      data.minPrice === undefined ||
      data.maxPrice === undefined ||
      data.minPrice <= data.maxPrice,
    {
      error: 'minPrice must be less than or equal to maxPrice',
      path: ['minPrice'],
    },
  );
export type TListArticleQuery = z.infer<typeof listArticleQuerySchema>;
