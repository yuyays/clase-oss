import { Router } from 'express';

import {
  createAssessmentVersion,
  getAssessmentVersions,
  publishLatestDraftVersion,
} from '../services/assessment-version-service.js';

export const assessmentVersionsRouter = Router();

assessmentVersionsRouter.get('/assessments/:assessmentId/versions', async (req, res) => {
  const assessmentIdParam = req.params.assessmentId;
  const assessmentId = Array.isArray(assessmentIdParam) ? assessmentIdParam[0] : assessmentIdParam;

  if (!assessmentId) {
    return res.status(400).json({ error: 'assessment id is required' });
  }

  const versions = await getAssessmentVersions(assessmentId);

  return res.status(200).json(versions);
});

assessmentVersionsRouter.post('/assessments/:assessmentId/versions', async (req, res) => {
  const assessmentIdParam = req.params.assessmentId;
  const assessmentId = Array.isArray(assessmentIdParam) ? assessmentIdParam[0] : assessmentIdParam;

  if (!assessmentId) {
    return res.status(400).json({ error: 'assessment id is required' });
  }

  const version = await createAssessmentVersion(assessmentId);

  if (!version) {
    return res.status(404).json({ error: 'assessment not found' });
  }

  return res.status(201).json(version);
});

assessmentVersionsRouter.post('/assessments/:assessmentId/publish', async (req, res) => {
  const assessmentIdParam = req.params.assessmentId;
  const assessmentId = Array.isArray(assessmentIdParam) ? assessmentIdParam[0] : assessmentIdParam;

  if (!assessmentId) {
    return res.status(400).json({ error: 'assessment id is required' });
  }

  const result = await publishLatestDraftVersion(assessmentId);

  if (result && 'error' in result) {
    if (result.error === 'assessment not found') {
      return res.status(404).json({ error: result.error });
    }

    if (result.error === 'no draft version') {
      return res.status(409).json({ error: result.error });
    }
  }

  return res.status(200).json(result);
});
