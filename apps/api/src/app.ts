import 'dotenv/config';

import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { apiRouter } from './routes/index.js';

export const app = express();
app.set('trust proxy', 1);

const defaultCorsOrigins = ['http://localhost:5173'];
const configuredCorsOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedCorsOrigins =
  configuredCorsOrigins.length > 0 ? configuredCorsOrigins : defaultCorsOrigins;
const allowAllCorsOrigins = allowedCorsOrigins.includes('*');
const betaAccessKey = process.env.BETA_ACCESS_KEY?.trim();

if (process.env.NODE_ENV === 'production' && !betaAccessKey) {
  throw new Error('BETA_ACCESS_KEY is required in production');
}
if (process.env.NODE_ENV === 'production' && allowAllCorsOrigins) {
  throw new Error('CORS_ORIGIN cannot be * in production');
}

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || allowAllCorsOrigins || allowedCorsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS origin not allowed'));
    },
  }),
);
app.use(helmet());
app.use(express.json());
const enablePretty = process.env.LOG_PRETTY === 'true' || process.env.LOG_PRETTY === '1';

const logger = pino(
  enablePretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        },
      }
    : undefined,
);

app.use(
  pinoHttp({
    redact: ['req.headers.authorization', 'req.headers.x-beta-key'],
    logger,
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  }),
);

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

if (betaAccessKey) {
  app.use((req, res, next) => {
    if (req.path === '/healthz' || req.method === 'OPTIONS') {
      return next();
    }

    const providedKey = req.header('x-beta-key');

    if (!providedKey) {
      return res.status(401).json({ error: 'missing beta access key' });
    }

    if (providedKey !== betaAccessKey) {
      return res.status(403).json({ error: 'invalid beta access key' });
    }

    return next();
  });
}

app.use(apiRouter);

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ err }, 'request failed');

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'file too large' });
    }

    return res.status(400).json({ error: err.code });
  }

  if (err.message === 'Unsupported file type') {
    return res.status(415).json({ error: err.message });
  }

  const nodeError = err as NodeJS.ErrnoException;
  if (nodeError.code === 'ECONNRESET' || err.message.includes('ECONNRESET')) {
    return res.status(503).json({ error: 'connection interrupted' });
  }

  if (err.message === 'CORS origin not allowed') {
    return res.status(403).json({ error: err.message });
  }

  if (err.message.startsWith('Invalid environment variables')) {
    return res.status(500).json({ error: 'missing environment configuration' });
  }

  return res.status(500).json({ error: 'internal server error' });
});
