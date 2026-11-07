import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { Request, Response, NextFunction } from 'express';
import logger from './logger';

export const logRequest = (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/metrics' || req.path === '/metrics/') {
    return next();
  }

  const requestId = randomUUID();
  const startedAt = performance.now();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.once('finish', () => {
    // Route templates keep IDs and query strings out of the log record.
    const route = typeof req.route?.path === 'string'
      ? `${req.baseUrl}${req.route.path}`
      : 'unmatched';

    logger.log({
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      message: 'HTTP request completed',
      requestId,
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
    });
  });

  next();
};
