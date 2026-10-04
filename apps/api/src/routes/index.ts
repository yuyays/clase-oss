import { Router } from 'express';

import { assessmentVersionsRouter } from './assessment-versions.js';
import { assessmentsRouter } from './assessments.js';
import { parsingRouter } from './parsing.js';
import { questionGenerationJobsRouter } from './question-generation-jobs.js';
import { questionsRouter } from './questions.js';
import { requireAnonymousAssessment } from '../lib/anonymous-session.js';

export const apiRouter = Router();

apiRouter.use(requireAnonymousAssessment);
apiRouter.use('/assessments', assessmentsRouter);
apiRouter.use(assessmentVersionsRouter);
apiRouter.use(questionsRouter);
apiRouter.use(parsingRouter);
apiRouter.use(questionGenerationJobsRouter);
