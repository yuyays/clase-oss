import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const message = Object.entries(errors)
    .map(([key, value]) => `${key}: ${value?.join(', ') ?? 'invalid'}`)
    .join('; ');

  throw new Error(`Invalid environment variables: ${message}`);
}

export const env = {
  databaseUrl: parsed.data.DATABASE_URL,
};
