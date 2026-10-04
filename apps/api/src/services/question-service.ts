import { and, desc, eq } from 'drizzle-orm';

import { assessmentVersions, assessments, db, questions } from '@clase/shared/server';

export type QuestionInput = Omit<typeof questions.$inferInsert, 'assessmentVersionId'>;

export const getDraftQuestions = async (assessmentId: string) => {
  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!assessment) {
    return null;
  }

  const [draftVersion] = await db
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

  if (!draftVersion) {
    return { assessmentVersion: null, questions: [] };
  }

  const list = await db
    .select()
    .from(questions)
    .where(eq(questions.assessmentVersionId, draftVersion.id))
    .orderBy(questions.orderIndex);

  return {
    assessmentVersion: draftVersion,
    questions: list,
  };
};

export const replaceDraftQuestions = async (
  assessmentVersionId: string,
  input: QuestionInput[],
) => {
  const [version] = await db
    .select()
    .from(assessmentVersions)
    .where(eq(assessmentVersions.id, assessmentVersionId))
    .limit(1);

  if (!version) {
    return { error: 'version not found' } as const;
  }

  if (version.status !== 'draft') {
    return { error: 'version not draft' } as const;
  }

  await db.delete(questions).where(eq(questions.assessmentVersionId, assessmentVersionId));

  if (input.length > 0) {
    await db.insert(questions).values(
      input.map((item, index) => ({
        ...item,
        assessmentVersionId,
        orderIndex: item.orderIndex ?? index + 1,
      })),
    );
  }

  return {
    assessmentVersion: version,
    questions: await db
      .select()
      .from(questions)
      .where(eq(questions.assessmentVersionId, assessmentVersionId))
      .orderBy(questions.orderIndex),
  };
};
