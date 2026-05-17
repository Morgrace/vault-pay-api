import {
  ApiSuccessResponse,
  ApiFailResponse,
  ApiErrorResponse,
  ErrorDetail,
  Meta,
} from '../interfaces/api-response.interface';

export function buildSuccess<T>(
  data: T,
  message: string,
  meta: Meta,
): ApiSuccessResponse<T> {
  return { status: 'success', message, data, meta };
}

export function buildFail(
  code: string,
  message: string,
  meta: Meta,
  details?: ErrorDetail[],
): ApiFailResponse {
  return {
    status: 'fail',
    error: { code, message, ...(details?.length ? { details } : {}) },
    meta,
  };
}

export function buildError(
  code: string,
  message: string,
  meta: Meta,
): ApiErrorResponse {
  return { status: 'error', error: { code, message }, meta };
}
