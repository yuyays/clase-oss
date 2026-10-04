import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { questions } from './questions.js';
import { assessmentVersions } from './tests.js';

export const questionGenerationStatusEnum = pgEnum('question_generation_status', [
  'queued',
  'running',
  'success',
  'failed',
]);

export const questionGenerationJobs = pgTable('question_generation_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  questionId: uuid('question_id')
    .notNull()
    .references(() => questions.id, { onDelete: 'cascade' }),
  assessmentVersionId: uuid('assessment_version_id')
    .notNull()
    .references(() => assessmentVersions.id, { onDelete: 'cascade' }),
  status: questionGenerationStatusEnum('status').notNull(),
  targetCorrectRate: integer('target_correct_rate').notNull(),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
