import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const userAgent = request.headers['user-agent'] ?? 'unknown';
    const now = Date.now();

    const correlationId =
      (request.headers['x-correlation-id'] as string) ||
      `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // attach so exception filter and meta builder can read it
    (request as any).correlationId = correlationId;

    this.logger.log(
      `[${correlationId}] --> ${method} ${url} | IP: ${ip} | UA: ${userAgent}`,
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          this.logger.log(
            `[${correlationId}] <-- ${method} ${url} | ${res.statusCode} | ${Date.now() - now}ms`,
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
