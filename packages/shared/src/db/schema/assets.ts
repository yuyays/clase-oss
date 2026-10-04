import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { assessments } from './tests.js';

export const assetSourceTypeEnum = pgEnum('asset_source_type', [
  'pdf',
  'docx',
  'image',
  'paste',
  'manual',
]);

export const assetFiles = pgTable('asset_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  assessmentId: uuid('assessment_id')
    .notNull()
    .references(() => assessments.id, { onDelete: 'cascade' }),
  storageUrl: text('storage_url').notNull(),
  mimeType: text('mime_type').notNull(),
  sourceType: assetSourceTypeEnum('source_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
