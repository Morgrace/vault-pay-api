import { Request } from 'express';
import { Meta } from '../interfaces/api-response.interface';

export function buildMeta(request: Request): Meta {
  return {
    timestamp: new Date().toISOString(),
    correlationId:
      (request as any).correlationId ||
      `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    path: request.url,
    method: request.method,
  };
}
