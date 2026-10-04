import { desc, eq } from 'drizzle-orm';

import { assetFiles, assessments, db, parsingJobs } from '@clase/shared/server';

export const getParsingStatus = async (assessmentId: string) => {
  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!assessment) {
    return null;
  }

  const [job] = await db
    .select({
      id: parsingJobs.id,
      status: parsingJobs.status,
      errorMessage: parsingJobs.errorMessage,
      metadata: parsingJobs.metadata,
      updatedAt: parsingJobs.updatedAt,
    })
    .from(parsingJobs)
    .innerJoin(assetFiles, eq(assetFiles.id, parsingJobs.assetFileId))
    .where(eq(assetFiles.assessmentId, assessmentId))
    .orderBy(desc(parsingJobs.createdAt))
    .limit(1);

  if (!job) {
    return { status: 'not_started' };
  }

  const metadata = job.metadata as
    | {
        rawText?: string;
        questionCount?: number;
        parser?: string;
        elapsedMs?: number;
        queueWaitMs?: number;
        llmMs?: number;
        llmPath?: 'text' | 'file' | 'heuristic';
        llmModel?: string;
        llmProviderRequestId?: string;
        llmOpenAiFileUploadMs?: number;
        llmOpenAiResponsesMs?: number;
      }
    | null
    | undefined;

  return {
    status: job.status,
    errorMessage: job.errorMessage,
    questionCount: metadata?.questionCount ?? 0,
    parser: metadata?.parser ?? null,
    elapsedMs: metadata?.elapsedMs ?? null,
    queueWaitMs: metadata?.queueWaitMs ?? null,
    llmMs: metadata?.llmMs ?? null,
    llmPath: metadata?.llmPath ?? null,
    llmModel: metadata?.llmModel ?? null,
    llmProviderRequestId: metadata?.llmProviderRequestId ?? null,
    llmOpenAiFileUploadMs: metadata?.llmOpenAiFileUploadMs ?? null,
    llmOpenAiResponsesMs: metadata?.llmOpenAiResponsesMs ?? null,
    updatedAt: job.updatedAt,
  };
};
