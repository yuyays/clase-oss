import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from './env.js';

const pool = new Pool({
  connectionString: env.databaseUrl,
});

pool.on('error', (error) => {
  const details =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
        }
      : {
          message: String(error),
        };

  console.error('postgres pool idle client error', details);
});

export const db = drizzle(pool);
