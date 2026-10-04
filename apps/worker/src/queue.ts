import { Queue } from 'bullmq';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const parsingQueue = new Queue('parsing', {
  connection: {
    url: redisUrl,
  },
});
