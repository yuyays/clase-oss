import { and, desc, eq } from 'drizzle-orm';

import { assessmentVersions, assessments, db } from '@clase/shared/server';

const publicAssessmentColumns = {
  id: assessments.id,
  title: assessments.title,
  description: assessments.description,
  assessmentCategory: assessments.assessmentCategory,
  customCategoryLabel: assessments.customCategoryLabel,
  subject: assessments.subject,
  grade: assessments.grade,
  expiresAt: assessments.expiresAt,
  createdAt: assessments.createdAt,
  updatedAt: assessments.updatedAt,
};

export const getAssessmentById = async (assessmentId: string) => {
  const [assessment] = await db
    .select(publicAssessmentColumns)
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!assessment) {
    return null;
  }

  const [latestDraft] = await db
    .select()
    .from(assessmentVersions)
    .where(
      and(
        eq(assessmentVersions.assessmentId, assessmentId),
        eq(assessmentVersions.status, 'draft'),
      ),
    )
    .orderBy(desc(assessmentVersions.versionNumber))
    .limit(1);

  return {
    ...assessment,
    latestDraftVersionId: latestDraft?.id ?? null,
  };
};

export type AssessmentCategory = 'quiz' | 'midterm' | 'final' | 'practice' | 'other';

export const createAssessment = async (input: {
  ownerSessionHash: string;
  expiresAt: Date;
  title: string;
  description?: string | null;
  assessmentCategory?: AssessmentCategory | null;
  customCategoryLabel?: string | null;
  subject?: string | null;
  grade?: string | null;
}) => {
  const [assessment] = await db
    .insert(assessments)
    .values({
      title: input.title,
      description: input.description ?? null,
      assessmentCategory: input.assessmentCategory ?? null,
      customCategoryLabel: input.customCategoryLabel ?? null,
      subject: input.subject ?? null,
      grade: input.grade ?? null,
      ownerSessionHash: input.ownerSessionHash,
      expiresAt: input.expiresAt,
    })
    .returning(publicAssessmentColumns);

  if (!assessment) {
    throw new Error('Failed to create assessment');
  }

  return assessment;
};

export const updateAssessment = async (
  assessmentId: string,
  updates: Partial<{
    title: string;
    description?: string | null;
    assessmentCategory?: AssessmentCategory | null;
    customCategoryLabel?: string | null;
    subject?: string | null;
    grade?: string | null;
  }>,
) => {
  if (Object.keys(updates).length === 0) {
    return getAssessmentById(assessmentId);
  }

  const [assessment] = await db
    .update(assessments)
    .set({
      title: updates.title,
      description: updates.description ?? null,
      assessmentCategory: updates.assessmentCategory ?? null,
      customCategoryLabel: updates.customCategoryLabel ?? null,
      subject: updates.subject ?? null,
      grade: updates.grade ?? null,
      updatedAt: new Date(),
    })
    .where(eq(assessments.id, assessmentId))
    .returning(publicAssessmentColumns);

  return assessment ?? null;
};

export const getLatestDraftVersion = async (assessmentId: string) => {
  const [version] = await db
    .select()
    .from(assessmentVersions)
    .where(
      and(
        eq(assessmentVersions.assessmentId, assessmentId),
        eq(assessmentVersions.status, 'draft'),
      ),
    )
    .orderBy(desc(assessmentVersions.versionNumber))
    .limit(1);

  return version ?? null;
};

export const getLatestVersion = async (assessmentId: string) => {
  const [version] = await db
    .select()
    .from(assessmentVersions)
    .where(eq(assessmentVersions.assessmentId, assessmentId))
    .orderBy(desc(assessmentVersions.versionNumber))
    .limit(1);

  return version ?? null;
};
