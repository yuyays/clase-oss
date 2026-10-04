import { createHash } from 'node:crypto';

import type { RequestHandler } from 'express';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
});
// Requests fail closed below; avoid logging each background reconnect attempt.
redis.on('error', () => {});

const LIMIT_SCRIPT = `
  local localCount = tonumber(redis.call('GET', KEYS[1]) or '0')
  local globalCount = tonumber(redis.call('GET', KEYS[2]) or '0')
  if localCount >= tonumber(ARGV[1]) or globalCount >= tonumber(ARGV[2]) then
    return 0
  end
  redis.call('INCR', KEYS[1])
  redis.call('INCR', KEYS[2])
  redis.call('EXPIRE', KEYS[1], ARGV[3])
  redis.call('EXPIRE', KEYS[2], ARGV[3])
  return 1
`;

type LimitKind = 'assessment' | 'upload' | 'regenerate';
const limits: Record<LimitKind, { perIp: number; global: number }> = {
  assessment: { perIp: 10, global: 200 },
  upload: { perIp: 6, global: 50 },
  regenerate: { perIp: 10, global: 100 },
};

export const limitPublicAction =
  (kind: LimitKind): RequestHandler =>
  async (req, res, next) => {
    const day = new Date().toISOString().slice(0, 10);
    const ipHash = createHash('sha256')
      .update(req.ip ?? 'unknown')
      .digest('hex');
    const { perIp, global } = limits[kind];

    try {
      const allowed = await redis.eval(
        LIMIT_SCRIPT,
        2,
        `clase:limit:${day}:${kind}:ip:${ipHash}`,
        `clase:limit:${day}:${kind}:global`,
        perIp,
        global,
        2 * 24 * 60 * 60,
      );
      if (allowed !== 1) {
        return res.status(429).json({ error: 'daily usage limit reached' });
      }
      return next();
    } catch (error) {
      req.log?.error({ err: error }, 'public rate limiter unavailable');
      return res.status(503).json({ error: 'service temporarily unavailable' });
    }
  };
