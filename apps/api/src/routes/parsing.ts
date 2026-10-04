import { Router } from 'express';

import { getParsingStatus } from '../services/parsing-service.js';

export const parsingRouter = Router();

parsingRouter.get('/assessments/:assessmentId/parsing-status', async (req, res) => {
  const assessmentIdParam = req.params.assessmentId;
  const assessmentId = Array.isArray(assessmentIdParam) ? assessmentIdParam[0] : assessmentIdParam;

  if (!assessmentId) {
    return res.status(400).json({ error: 'assessment id is required' });
  }

  const result = await getParsingStatus(assessmentId);

  if (!result) {
    return res.status(404).json({ error: 'assessment not found' });
  }

  return res.status(200).json(result);
});
