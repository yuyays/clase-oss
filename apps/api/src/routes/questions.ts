import { Router } from 'express';

import { questionRegenerateRequestSchema, questionsReplacePayloadSchema } from '@clase/shared';

import { questionGenerationQueue } from '../lib/queue.js';
import { limitPublicAction } from '../lib/public-limits.js';
import { getDraftQuestions, replaceDraftQuestions } from '../services/question-service.js';
import {
  createQuestionGenerationJob,
  getQuestionGenerationContext,
} from '../services/question-generation-service.js';

export const questionsRouter = Router();

questionsRouter.get('/assessments/:assessmentId/questions', async (req, res) => {
  const assessmentIdParam = req.params.assessmentId;
  const assessmentId = Array.isArray(assessmentIdParam) ? assessmentIdParam[0] : assessmentIdParam;

  if (!assessmentId) {
    return res.status(400).json({ error: 'assessment id is required' });
  }

  const result = await getDraftQuestions(assessmentId);

  if (!result) {
    return res.status(404).json({ error: 'assessment not found' });
  }

  return res.status(200).json(result);
});

questionsRouter.put('/assessment-versions/:assessmentVersionId/questions', async (req, res) => {
  const versionIdParam = req.params.assessmentVersionId;
  const assessmentVersionId = Array.isArray(versionIdParam) ? versionIdParam[0] : versionIdParam;

  if (!assessmentVersionId) {
    return res.status(400).json({ error: 'assessment version id is required' });
  }

  if (!Array.isArray(req.body)) {
    return res.status(422).json({ error: 'questions payload must be an array' });
  }

  const parsed = questionsReplacePayloadSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.flatten() });
  }

  const invalidChoice = parsed.data.find(
    (item) =>
      (item.type === 'multiple_choice' || item.type === 'true_false') &&
      (!item.choices || item.choices.length === 0),
  );

  if (invalidChoice) {
    return res.status(422).json({ error: 'choices are required for objective questions' });
  }

  const result = await replaceDraftQuestions(
    assessmentVersionId,
    parsed.data as Parameters<typeof replaceDraftQuestions>[1],
  );

  if (result?.error === 'version not found') {
    return res.status(404).json({ error: result.error });
  }

  if (result?.error === 'version not draft') {
    return res.status(409).json({ error: result.error });
  }

  return res.status(200).json(result);
});

questionsRouter.post(
  '/questions/:questionId/regenerate',
  limitPublicAction('regenerate'),
  async (req, res) => {
    const questionIdParam = req.params.questionId;
    const questionId = Array.isArray(questionIdParam) ? questionIdParam[0] : questionIdParam;

    if (!questionId) {
      return res.status(400).json({ error: 'question id is required' });
    }

    const parsed = questionRegenerateRequestSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      return res.status(422).json({ error: parsed.error.flatten() });
    }

    const targetCorrectRate = parsed.data.targetCorrectRate ?? 60;
    const mode = parsed.data.mode ?? 'replace';
    const style = parsed.data.style ?? 'rewrite';
    const context = await getQuestionGenerationContext(questionId);

    if (!context) {
      return res.status(404).json({ error: 'question not found' });
    }

    if (context.assessmentVersion.status !== 'draft') {
      return res.status(409).json({ error: 'version not draft' });
    }

    const job = await createQuestionGenerationJob({
      questionId,
      assessmentVersionId: context.assessmentVersion.id,
      targetCorrectRate,
      mode,
      style,
    });

    if (!job) {
      return res.status(500).json({ error: 'failed to create generation job' });
    }

    await questionGenerationQueue.add('generate-question', {
      jobId: job.id,
      questionId,
      assessmentVersionId: context.assessmentVersion.id,
      targetCorrectRate,
      mode,
      style,
    });

    return res.status(202).json({ jobId: job.id, status: job.status });
  },
);
