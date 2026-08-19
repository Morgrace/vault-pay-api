import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { appConfig } from 'src/config';
import { ZodError } from 'zod';

interface ErrorLogData {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error: string;
  correlationId: string;
  stack?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
}

interface ErrorContext {
  status: HttpStatus;
  message: string;
  error: string;
  errors?: Array<{ field: string; message: string }>;
}

/**
 * Error envelope mirrors the success envelope shape produced by
 * ResponseTransformInterceptor: { status, success, data, message }.
 * For errors, `data` is null and additional diagnostic fields
 * (`error`, `errors`, `correlationId`, ...) are appended.
 */
interface ErrorResponseBase {
  status: number;
  success: false;
  data: null;
  message: string;
  error: string;
  errors?: Array<{ field: string; message: string }>;
  correlationId: string;
  method: string;
}

interface DevelopmentErrorResponse extends ErrorResponseBase {
  path: string;
  timestamp: string;
}

interface PostgresDriverError {
  code: string;
  detail?: string;
  message?: string;
}

interface NodeSystemError {
  code: string;
}

@Catch()
export class CustomExceptionFilters implements ExceptionFilter {
  private readonly logger = new Logger(CustomExceptionFilters.name);
  private readonly isProduction = appConfig().app.env === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const correlationId =
      request?.correlationId ?? this.generateCorrelationId();

    const errorContext = this.determineErrorContext(exception);

    this.logError(exception, request, errorContext, correlationId);

    const errorResponse = this.createErrorResponse(
      errorContext,
      request,
      correlationId,
    );

    response.status(errorContext.status).json(errorResponse);
  }

  private determineErrorContext(exception: unknown): ErrorContext {
    if (exception instanceof HttpException) {
      return this.handleHttpException(exception);
    }

    if (exception instanceof ZodError) {
      return this.handleZodError(exception);
    }

    if (this.isPostgresError(exception)) {
      return this.handlePostgresError(exception);
    }

    if (this.isSystemError(exception)) {
      return this.handleSystemError(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: this.isProduction
        ? 'An unexpected error occurred'
        : this.sanitizeMessage(this.getExceptionMessage(exception)) ||
          'Internal server error',
      error: 'Internal Server Error',
    };
  }

  private handleHttpException(exception: HttpException): ErrorContext {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return {
        status,
        message: this.sanitizeMessage(exceptionResponse),
        error: this.getHttpErrorName(status),
      };
    }

    const responseObj = exceptionResponse as Record<string, unknown>;
    return {
      status,
      message: this.sanitizeMessage(responseObj.message) || exception.message,
      error:
        typeof responseObj.error === 'string'
          ? responseObj.error
          : this.getHttpErrorName(status),
      errors: Array.isArray(responseObj.errors)
        ? (responseObj.errors as Array<{ field: string; message: string }>)
        : undefined,
    };
  }

  private handleZodError(zodError: ZodError): ErrorContext {
    return {
      status: HttpStatus.BAD_REQUEST,
      message: 'Request validation failed',
      error: 'Validation Error',
      errors: zodError.issues.map((issue) => ({
        field: issue.path.join('.') || 'unknown',
        message: this.sanitizeMessage(issue.message) || 'Invalid value',
      })),
    };
  }

  private handlePostgresError(exception: PostgresDriverError): ErrorContext {
    const errorCode = exception.code || '';

    switch (errorCode) {
      case '23505': {
        const duplicateMatch = exception.detail?.match(/Key \((.+?)\)=/);
        const duplicateField = duplicateMatch ? duplicateMatch[1] : 'field';

        return {
          status: HttpStatus.CONFLICT,
          message: `Duplicate ${duplicateField} provided`,
          error: 'Duplicate Entry',
          errors: [
            {
              field: duplicateField,
              message:
                this.sanitizeMessage(exception.detail) ||
                'Value already exists',
            },
          ],
        };
      }

      case '23503':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Referenced resource does not exist',
          error: 'Foreign Key Violation',
        };

      case '23502': {
        const columnMatch = exception.message?.match(/column "(.+?)"/);
        const columnName = columnMatch ? columnMatch[1] : 'field';

        return {
          status: HttpStatus.BAD_REQUEST,
          message: `Required field '${columnName}' is missing`,
          error: 'Validation Error',
          errors: [
            {
              field: columnName,
              message: 'This field is required',
            },
          ],
        };
      }

      case '23514':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Data validation failed',
          error: 'Validation Error',
        };

      case '22P02':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid data format provided',
          error: 'Invalid Format',
        };

      case '22003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Numeric value out of range',
          error: 'Invalid Value',
        };

      case '22001':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Value too long for field',
          error: 'Validation Error',
        };

      case '42601':
      case '42P01':
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database query error',
          error: 'Database Error',
        };

      case '08000':
      case '08003':
      case '08006':
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Database connection error',
          error: 'Database Unavailable',
        };

      case '40P01':
        return {
          status: HttpStatus.CONFLICT,
          message: 'Resource conflict detected. Please retry',
          error: 'Deadlock',
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: this.isProduction
            ? 'Database operation failed'
            : `Database error: ${errorCode}`,
          error: 'Database Error',
        };
    }
  }

  private handleSystemError(exception: NodeSystemError): ErrorContext {
    const code = exception.code;

    switch (code) {
      case 'ENOTFOUND':
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'External service unavailable',
          error: 'Service Unavailable',
        };

      case 'ECONNREFUSED':
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Connection refused',
          error: 'Connection Error',
        };

      case 'ETIMEDOUT':
        return {
          status: HttpStatus.REQUEST_TIMEOUT,
          message: 'Request timeout',
          error: 'Timeout',
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: this.isProduction
            ? 'System error occurred'
            : `System error: ${code}`,
          error: 'System Error',
        };
    }
  }

  private createErrorLog(
    errorContext: ErrorContext,
    request: Request,
    exception: unknown,
    correlationId: string,
  ): ErrorLogData {
    return {
      statusCode: errorContext.status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: errorContext.message,
      error: errorContext.error,
      correlationId,
      stack: exception instanceof Error ? exception.stack : undefined,
      headers: request.headers,
      query: request.query,
      body: request.body,
    };
  }

  private createErrorResponse(
    errorContext: ErrorContext,
    request: Request,
    correlationId: string,
  ): ErrorResponseBase | DevelopmentErrorResponse {
    const base: ErrorResponseBase = {
      status: errorContext.status,
      success: false,
      data: null,
      message: errorContext.message,
      error: errorContext.error,
      errors: errorContext.errors,
      correlationId,
      method: request.method,
    };

    if (this.isProduction) {
      return base;
    }

    return {
      ...base,
      path: request.url,
      timestamp: new Date().toISOString(),
    };
  }

  private logError(
    exception: unknown,
    request: Request,
    errorContext: ErrorContext,
    correlationId: string,
  ): void {
    const errorLog = this.createErrorLog(
      errorContext,
      request,
      exception,
      correlationId,
    );

    this.logger.error(
      `Exception [${correlationId}] ErrorLog: ${JSON.stringify(errorLog, null, 2)}`,
    );
  }

  private isPostgresError(
    exception: unknown,
  ): exception is PostgresDriverError {
    if (
      exception !== null &&
      typeof exception === 'object' &&
      'code' in exception
    ) {
      const code = (exception as Record<string, unknown>).code;
      if (typeof code === 'string') {
        return (
          code.startsWith('22') ||
          code.startsWith('23') ||
          code.startsWith('42') ||
          code.startsWith('08') ||
          code.startsWith('40')
        );
      }
    }
    return false;
  }

  private isSystemError(exception: unknown): exception is NodeSystemError {
    return (
      exception !== null &&
      typeof exception === 'object' &&
      'code' in exception &&
      typeof (exception as Record<string, unknown>).code === 'string'
    );
  }

  private getHttpErrorName(status: number): string {
    const statusNames: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };

    return statusNames[status] || 'Http Exception';
  }

  private getExceptionMessage(exception: unknown): unknown {
    if (
      exception !== null &&
      typeof exception === 'object' &&
      'message' in exception
    ) {
      return (exception as Record<string, unknown>).message;
    }
    return undefined;
  }

  private sanitizeMessage(message: unknown): string {
    if (typeof message !== 'string') {
      return '';
    }

    return message
      .replaceAll(/password\w*/gi, '[REDACTED]')
      .replaceAll(/token\w*/gi, '[REDACTED]')
      .replaceAll(/key\w*/gi, '[REDACTED]')
      .replaceAll(/secret\w*/gi, '[REDACTED]')
      .trim();
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
