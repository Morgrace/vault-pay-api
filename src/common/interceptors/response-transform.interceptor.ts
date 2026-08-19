import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T = unknown> {
  status: number;
  success: boolean;
  data?: T;
  message: string;
}
const EXACT_BYPASS_PATHS = new Set<string>(['/health']);
const PREFIX_BYPASS_PATHS: readonly string[] = ['/internal/'];

@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        if (this.shouldSkip(request, response)) {
          return data as unknown as ApiResponse<T>;
        }
        let message = this.getSuccessMessage(response.statusCode);
        let responseData: unknown = data;

        if (
          data !== null &&
          data !== undefined &&
          typeof data === 'object' &&
          'message' in data
        ) {
          const dataObj = data as Record<string, unknown>;
          if (typeof dataObj.message === 'string') {
            message = dataObj.message;
          }
          // eslint-disable-next-line
          const { message: _, ...rest } = dataObj;
          responseData = rest;
        }

        return {
          status: response.statusCode,
          success: true,
          data: responseData as T,
          message,
        };
      }),
    );
  }

  private getSuccessMessage(statusCode: number): string {
    switch (statusCode) {
      case 200:
        return 'Request successful';
      case 201:
        return 'Resource created successfully';
      case 204:
        return 'Request processed successfully';
      default:
        return 'Success';
    }
  }

  private shouldSkip(request: Request, response: Response): boolean {
    // Non-JSON content type set by the handler (e.g. Prometheus text/plain).
    const contentType = response.getHeader('Content-Type');
    if (
      typeof contentType === 'string' &&
      !contentType.toLowerCase().includes('json')
    ) {
      return true;
    }

    const path = request.url.split('?')[0];

    if (EXACT_BYPASS_PATHS.has(path)) return true;
    return PREFIX_BYPASS_PATHS.some((p) => path.startsWith(p));
  }
}
