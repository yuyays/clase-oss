import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { assessmentVersions } from './tests.js';

export const questionTypeEnum = pgEnum('question_type', [
  'multiple_choice',
  'true_false',
  'short_answer',
  'written',
  'other',
]);

export const questions = pgTable('questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  assessmentVersionId: uuid('assessment_version_id')
    .notNull()
    .references(() => assessmentVersions.id, { onDelete: 'cascade' }),
  type: questionTypeEnum('type').notNull(),
  prompt: text('prompt').notNull(),
  choices: jsonb('choices'),
  correctAnswer: jsonb('correct_answer'),
  points: integer('points'),
  orderIndex: integer('order_index').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
