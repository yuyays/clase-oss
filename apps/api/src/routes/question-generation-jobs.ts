import { Router } from 'express';

import { getQuestionGenerationJob } from '../services/question-generation-service.js';

export const questionGenerationJobsRouter = Router();

questionGenerationJobsRouter.get('/question-generation-jobs/:jobId', async (req, res) => {
  const jobIdParam = req.params.jobId;
  const jobId = Array.isArray(jobIdParam) ? jobIdParam[0] : jobIdParam;

  if (!jobId) {
    return res.status(400).json({ error: 'job id is required' });
  }

  const job = await getQuestionGenerationJob(jobId);

  if (!job) {
    return res.status(404).json({ error: 'job not found' });
  }

  const metadata =
    job.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata)
      ? (job.metadata as {
          mode?: unknown;
          style?: unknown;
          resultQuestionId?: unknown;
          queueWaitMs?: unknown;
          dbReadMs?: unknown;
          dbWriteMs?: unknown;
          elapsedMs?: unknown;
          llm?: {
            durationMs?: unknown;
            inputTokens?: unknown;
            outputTokens?: unknown;
            totalTokens?: unknown;
            providerRequestId?: unknown;
          };
        })
      : null;
  const mode =
    metadata?.mode === 'insert' || metadata?.mode === 'replace' ? metadata.mode : undefined;
  const style =
    metadata?.style === 'rewrite' || metadata?.style === 'similar' ? metadata.style : undefined;
  const resultQuestionId =
    typeof metadata?.resultQuestionId === 'string' ? metadata.resultQuestionId : null;
  const queueWaitMs = typeof metadata?.queueWaitMs === 'number' ? metadata.queueWaitMs : null;
  const dbReadMs = typeof metadata?.dbReadMs === 'number' ? metadata.dbReadMs : null;
  const dbWriteMs = typeof metadata?.dbWriteMs === 'number' ? metadata.dbWriteMs : null;
  const elapsedMs = typeof metadata?.elapsedMs === 'number' ? metadata.elapsedMs : null;
  const llmDurationMs =
    typeof metadata?.llm?.durationMs === 'number' ? metadata.llm.durationMs : null;
  const llmInputTokens =
    typeof metadata?.llm?.inputTokens === 'number' ? metadata.llm.inputTokens : null;
  const llmOutputTokens =
    typeof metadata?.llm?.outputTokens === 'number' ? metadata.llm.outputTokens : null;
  const llmTotalTokens =
    typeof metadata?.llm?.totalTokens === 'number' ? metadata.llm.totalTokens : null;
  const llmProviderRequestId =
    typeof metadata?.llm?.providerRequestId === 'string' ? metadata.llm.providerRequestId : null;

  return res.status(200).json({
    id: job.id,
    status: job.status,
    errorMessage: job.errorMessage ?? null,
    updatedAt: job.updatedAt.toISOString(),
    mode,
    style,
    resultQuestionId,
    queueWaitMs,
    dbReadMs,
    dbWriteMs,
    elapsedMs,
    llmDurationMs,
    llmInputTokens,
    llmOutputTokens,
    llmTotalTokens,
    llmProviderRequestId,
  });
});
