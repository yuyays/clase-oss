import 'dotenv/config';

import { Queue } from 'bullmq';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const parsingQueue = new Queue('parsing', {
  connection: {
    url: redisUrl,
  },
});

export const questionGenerationQueue = new Queue('question-generation', {
  connection: {
    url: redisUrl,
  },
});
