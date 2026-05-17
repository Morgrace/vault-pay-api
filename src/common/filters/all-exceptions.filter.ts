import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { buildMeta } from '../utils/meta.util';
import { buildError, buildFail } from '../utils/response.util';
import { statusToErrorCode } from '../utils/http-error.util';
import { ErrorDetail } from '../interfaces/api-response.interface';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const meta = buildMeta(request);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      this.logger.error(exception);
      response
        .status(status)
        .json(
          buildError('INTERNAL_SERVER_ERROR', 'Internal server error', meta),
        );
      return;
    }

    let code = statusToErrorCode(status);
    let message = 'Request failed';
    let details: ErrorDetail[] | undefined;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body != null) {
        const b = body as Record<string, any>;
        message = b.message ?? message;
        if (b.code) code = b.code as string;
        if (Array.isArray(b.errors)) details = b.errors as ErrorDetail[];
      }
    }

    response.status(status).json(buildFail(code, message, meta, details));
  }
}
