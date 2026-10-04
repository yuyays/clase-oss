import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './packages/shared/src/db/schema/tests.ts',
    './packages/shared/src/db/schema/questions.ts',
    './packages/shared/src/db/schema/assets.ts',
    './packages/shared/src/db/schema/parsing.ts',
    './packages/shared/src/db/schema/question-generation-jobs.ts',
    './packages/shared/src/db/schema/audit.ts',
    './packages/shared/src/db/schema/upload-requests.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
