import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { createLifecycleState, markLifecycle } from '@connectingmatrix/logger/lifecycle-jsonl';

const HEADER = 'X-Request-Id';

const readHeader = (request: Request) => {
  const value = request.header(HEADER);
  return String(value || '').trim();
};

export const requestIdMiddleware = (request: Request, response: Response, next: NextFunction) => {
  const requestId = readHeader(request) || randomUUID();
  (request as any).requestId = requestId;
  (request as any).lifecycleState = createLifecycleState(requestId);
  response.setHeader(HEADER, requestId);
  markLifecycle((request as any).lifecycleState, {
    layer: 'middleware',
    event: 'http.request',
    phase: 'start',
    transport: 'graphql',
    meta: { method: request.method, path: request.path },
  });
  response.on('finish', () => {
    markLifecycle((request as any).lifecycleState, {
      layer: 'middleware',
      event: 'http.request',
      phase: 'end',
      transport: 'graphql',
      status: response.statusCode < 400 ? 'passed' : 'failed',
      meta: { code: response.statusCode },
    });
  });
  next();
};
