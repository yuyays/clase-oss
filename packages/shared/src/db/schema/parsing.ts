import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { assetFiles } from './assets.js';

export const parsingStatusEnum = pgEnum('parsing_status', [
  'queued',
  'running',
  'success',
  'failed',
]);

export const parsingJobs = pgTable('parsing_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetFileId: uuid('asset_file_id')
    .notNull()
    .references(() => assetFiles.id, { onDelete: 'cascade' }),
  status: parsingStatusEnum('status').notNull(),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
