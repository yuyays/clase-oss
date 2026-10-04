import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

import { assessmentVersions, assessments } from './tests.js';
import { assetFiles } from './assets.js';
import { parsingJobs } from './parsing.js';
import { questionGenerationJobs } from './question-generation-jobs.js';
import { questions } from './questions.js';
import { assessmentUploadRequests } from './upload-requests.js';

export const assessmentsInsertSchema = createInsertSchema(assessments);
export const assessmentsSelectSchema = createSelectSchema(assessments);

export const assessmentVersionsInsertSchema = createInsertSchema(assessmentVersions);
export const assessmentVersionsSelectSchema = createSelectSchema(assessmentVersions);

export const questionsInsertSchema = createInsertSchema(questions);
export const questionsSelectSchema = createSelectSchema(questions);

export const assetFilesInsertSchema = createInsertSchema(assetFiles);
export const assetFilesSelectSchema = createSelectSchema(assetFiles);

export const parsingJobsInsertSchema = createInsertSchema(parsingJobs);
export const parsingJobsSelectSchema = createSelectSchema(parsingJobs);

export const questionGenerationJobsInsertSchema = createInsertSchema(questionGenerationJobs);
export const questionGenerationJobsSelectSchema = createSelectSchema(questionGenerationJobs);

export const assessmentUploadRequestsInsertSchema = createInsertSchema(assessmentUploadRequests);
export const assessmentUploadRequestsSelectSchema = createSelectSchema(assessmentUploadRequests);
