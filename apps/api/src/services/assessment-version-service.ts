import { and, desc, eq } from 'drizzle-orm';

import { assessmentVersions, assessments, db } from '@clase/shared/server';

export const getAssessmentVersions = async (assessmentId: string) => {
  return db
    .select()
    .from(assessmentVersions)
    .where(eq(assessmentVersions.assessmentId, assessmentId))
    .orderBy(desc(assessmentVersions.versionNumber));
};

export const createAssessmentVersion = async (assessmentId: string) => {
  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!assessment) {
    return null;
  }

  const [latestVersion] = await db
    .select({ versionNumber: assessmentVersions.versionNumber })
    .from(assessmentVersions)
    .where(eq(assessmentVersions.assessmentId, assessmentId))
    .orderBy(desc(assessmentVersions.versionNumber))
    .limit(1);

  const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

  const [version] = await db
    .insert(assessmentVersions)
    .values({
      assessmentId,
      versionNumber: nextVersionNumber,
      status: 'draft',
    })
    .returning();

  return version ?? null;
};

export const publishLatestDraftVersion = async (assessmentId: string) => {
  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!assessment) {
    return { error: 'assessment not found' } as const;
  }

  const [draft] = await db
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

  if (!draft) {
    return { error: 'no draft version' } as const;
  }

  const [published] = await db
    .update(assessmentVersions)
    .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(assessmentVersions.id, draft.id))
    .returning();

  return published ?? null;
};
