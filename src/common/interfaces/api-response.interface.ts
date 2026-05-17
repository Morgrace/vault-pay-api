export type ResponseStatus = 'success' | 'fail' | 'error';

export interface Meta {
  timestamp: string;
  correlationId: string;
  path: string;
  method: string;
}

export interface ErrorDetail {
  field: string;
  message: string;
  code: string;
  index?: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: ErrorDetail[];
}

export interface ApiSuccessResponse<T = unknown> {
  status: 'success';
  message: string;
  data: T;
  meta: Meta;
}

export interface ApiFailResponse {
  status: 'fail';
  error: ErrorPayload;
  meta: Meta;
}

export interface ApiErrorResponse {
  status: 'error';
  error: ErrorPayload;
  meta: Meta;
}

export type ApiResponse<T = unknown> =
  | ApiSuccessResponse<T>
  | ApiFailResponse
  | ApiErrorResponse;
