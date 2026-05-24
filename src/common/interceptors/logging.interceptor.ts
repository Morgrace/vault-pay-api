import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const { method, url, ip } = request;
    const userAgent = request.headers['user-agent'] ?? 'unknown';
    const now = Date.now();

    const correlationId =
      (request.headers['x-correlation-id'] as string) ||
      `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // attach so exception filter and meta builder can read it
    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    this.logger.log(
      `[${correlationId}] --> ${method} ${url} | IP: ${ip} | UA: ${userAgent}`,
    );

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `[${correlationId}] <-- ${method} ${url} | ${response.statusCode} | ${Date.now() - now}ms`,
          );
        },
        error: (err: Error) => {
          this.logger.error(
            `[${correlationId}] <-- ${method} ${url} | ERROR: ${err.message} | ${Date.now() - now}ms`,
          );
        },
      }),
    );
  }
}
