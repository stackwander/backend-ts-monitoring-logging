import dotenv from 'dotenv';
import winston, { format, transports } from 'winston';
import LokiTransport from 'winston-loki';

dotenv.config();

export function createAppLogger(env: NodeJS.ProcessEnv = process.env): winston.Logger {
  const service = env.APP_NAME || 'backendcleants_p4';
  const logger = winston.createLogger({
    level: env.LOG_LEVEL || 'info',
    defaultMeta: { service },
    format: format.combine(format.timestamp(), format.json()),
    transports: [new transports.Console()],
  });

  // Console logging works independently of the optional Loki stack.
  if (env.LOKI_ENABLED === 'true') {
    logger.add(new LokiTransport({
      host: env.LOKI_URL || 'http://127.0.0.1:3100',
      json: true,
      format: format.json(),
      labels: { job: service },
      timeout: 5000,
      clearOnError: true,
      onConnectionError: () => console.error('Loki is unavailable; check LOKI_URL and the Loki service.'),
    }));
  }

  return logger;
}

export default createAppLogger();
