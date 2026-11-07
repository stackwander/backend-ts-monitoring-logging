import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default metrics collection
client.collectDefaultMetrics({ register });

// Create a custom metric
const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});


// Register the custom metric
register.registerMetric(httpRequestDurationSeconds);

// Middleware to collect metrics - end point monitoring 
const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Scraping should not inflate the application's traffic and latency charts.
  if (req.path === '/metrics' || req.path === '/metrics/') {
    return next();
  }

  const end = httpRequestDurationSeconds.startTimer();
  res.once('finish', () => {
    const route = typeof req.route?.path === 'string'
      ? `${req.baseUrl}${req.route.path}`
      : 'unmatched';
    end({ method: req.method, route, code: res.statusCode });
  });
  next();
};

// Endpoint to expose metrics
const metricsEndpoint = async (req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};

export { metricsMiddleware, metricsEndpoint };
