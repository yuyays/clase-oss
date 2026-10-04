import { eq } from 'drizzle-orm';

import {
  assessments,
  assessmentVersions,
  db,
  questionGenerationJobs,
  questions,
} from '@clase/shared/server';

export const getQuestionGenerationContext = async (questionId: string) => {
  const [record] = await db
    .select({
      question: questions,
      assessmentVersion: assessmentVersions,
      assessment: assessments,
    })
    .from(questions)
    .innerJoin(assessmentVersions, eq(questions.assessmentVersionId, assessmentVersions.id))
    .innerJoin(assessments, eq(assessmentVersions.assessmentId, assessments.id))
    .where(eq(questions.id, questionId))
    .limit(1);

  return record ?? null;
};

export const createQuestionGenerationJob = async (input: {
  questionId: string;
  assessmentVersionId: string;
  targetCorrectRate: number;
  mode: 'replace' | 'insert';
  style: 'rewrite' | 'similar';
}) => {
  const [job] = await db
    .insert(questionGenerationJobs)
    .values({
      questionId: input.questionId,
      assessmentVersionId: input.assessmentVersionId,
      targetCorrectRate: input.targetCorrectRate,
      status: 'queued',
      errorMessage: null,
      metadata: {
        mode: input.mode,
        style: input.style,
        resultQuestionId: null,
      },
    })
    .returning();

  return job ?? null;
};

export const getQuestionGenerationJob = async (jobId: string) => {
  const [job] = await db
    .select()
    .from(questionGenerationJobs)
    .where(eq(questionGenerationJobs.id, jobId))
    .limit(1);

  return job ?? null;
};
