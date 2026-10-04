import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const assessmentCategoryEnum = pgEnum('assessment_category', [
  'quiz',
  'midterm',
  'final',
  'practice',
  'other',
]);

export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    assessmentCategory: assessmentCategoryEnum('assessment_category'),
    customCategoryLabel: text('custom_category_label'),
    subject: text('subject'),
    grade: text('grade'),
    ownerSessionHash: text('owner_session_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('assessments_expires_at_idx').on(table.expiresAt)],
);

export const assessmentVersionStatusEnum = pgEnum('assessment_version_status', [
  'draft',
  'published',
]);

export const assessmentVersions = pgTable('assessment_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  assessmentId: uuid('assessment_id')
    .notNull()
    .references(() => assessments.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  status: assessmentVersionStatusEnum('status').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
