import z from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';
import { BadRequestException } from '@nestjs/common';

describe('ZodValidationPipe', () => {
  it('returns parsed data when input is valid', async () => {
    // Arrange
    const schema = z.object({ name: z.string() });
    const pipe = new ZodValidationPipe(schema);

    // Act
    const result = await pipe.transform({ name: 'Morgrace' });

    // Assert
    expect(result).toEqual({ name: 'Morgrace' });
  });

  it('throws BadRequestException when input fails schema validation', async () => {
    // Arrange
    const schema = z.object({ name: z.string() });
    const pipe = new ZodValidationPipe(schema);

    // Act
    const result = pipe.transform({ name: 2345 });

    // Assert
    await expect(result).rejects.toThrow(BadRequestException);
  });

  it('includes field-level error details when validation fails', async () => {
    // Arrange
    const schema = z.object({ name: z.string() });
    const pipe = new ZodValidationPipe(schema);

    // Act && Assert
    try {
      await pipe.transform({ name: 123 });
      fail('expected transform to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);

      const response = (error as BadRequestException).getResponse() as {
        error: string;
        message: string;
        errors: Array<{ field: string; code: string }>;
      };
      expect(response.error).toBe('Bad Request');
      expect(response.errors).toHaveLength(1);
      expect(response.errors[0]).toMatchObject({
        field: 'name',
        code: 'invalid_type',
      });
    }
  });
});
