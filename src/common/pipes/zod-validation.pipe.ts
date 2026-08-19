import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';
import { $ZodIssue } from 'zod/v4/core';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  async transform(value: unknown) {
    const result = await this.schema.safeParseAsync(value);
    if (!result.success) {
      throw new BadRequestException({
        error: 'Bad Request',
        message: 'Validation failed',
        errors: this.formatZodErrors(result.error.issues),
      });
    }
    return result.data;
  }

  private formatZodErrors(issues: $ZodIssue[]) {
    return issues.map((issue) => ({
      field: issue.path.length > 0 ? issue.path.join('.') : 'root',
      message: issue.message,
      code: issue.code,
      received: 'received' in issue ? issue.received : undefined,
      expected: 'expected' in issue ? issue.expected : undefined,
    }));
  }
}
