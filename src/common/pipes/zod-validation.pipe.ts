import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const errors = result.error.issues.map((issue) => {
      const lastPath = issue.path[issue.path.length - 1];
      return {
        field: issue.path.join('.') || 'root',
        message: issue.message,
        code: issue.code.toUpperCase(),
        ...(typeof lastPath === 'number' ? { index: lastPath } : {}),
      };
    });

    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      errors,
    });
  }
}
