import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';
import { buildMeta } from '../utils/meta.util';
import { buildSuccess } from '../utils/response.util';

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

    return next.handle().pipe(
      map((data) => {
        const meta = buildMeta(request);
        let message = 'Request successful';
        let payload: unknown = data;

        if (data && typeof data === 'object' && 'message' in data) {
          message = (data as Record<string, any>).message as string;
          // eslint-disable-next-line
          const { message: _, ...rest } = data as Record<string, any>;
          payload = Object.keys(rest).length > 0 ? rest : undefined;
        }

        return buildSuccess(payload as T, message, meta);
      }),
    );
  }
}
