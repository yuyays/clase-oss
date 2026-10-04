import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { assetFiles } from './assets.js';
import { parsingJobs } from './parsing.js';
import { assessments } from './tests.js';

export const assessmentUploadRequestStatusEnum = pgEnum('assessment_upload_request_status', [
  'processing',
  'success',
  'failed',
]);

export const assessmentUploadRequests = pgTable(
  'assessment_upload_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    status: assessmentUploadRequestStatusEnum('status').notNull(),
    assetFileId: uuid('asset_file_id').references(() => assetFiles.id, { onDelete: 'set null' }),
    parsingJobId: uuid('parsing_job_id').references(() => parsingJobs.id, { onDelete: 'set null' }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('assessment_upload_requests_assessment_idempotency_key_idx').on(
      table.assessmentId,
      table.idempotencyKey,
    ),
  ],
);
