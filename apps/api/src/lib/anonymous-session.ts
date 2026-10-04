import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Request, RequestHandler, Response } from 'express';

import {
  assessments,
  assessmentVersions,
  db,
  questionGenerationJobs,
  questions,
} from '@clase/shared/server';

const COOKIE_NAME = 'clase_session';
export const ASSESSMENT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const assessmentPath = new RegExp(`^/assessments/(${UUID})(?:/.*)?$`);
const versionPath = new RegExp(`^/assessment-versions/(${UUID})/questions$`);
const questionPath = new RegExp(`^/questions/(${UUID})/regenerate$`);
const jobPath = new RegExp(`^/question-generation-jobs/(${UUID})$`);

const readSessionToken = (req: Request) => {
  const cookie = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  const token = cookie?.slice(COOKIE_NAME.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const startAnonymousSession = (req: Request, res: Response) => {
  const token = readSessionToken(req) ?? randomBytes(32).toString('base64url');
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ASSESSMENT_LIFETIME_MS,
    path: '/',
  });
  return hashToken(token);
};

const ownedAssessmentCondition = (sessionHash: string) =>
  and(eq(assessments.ownerSessionHash, sessionHash), gt(assessments.expiresAt, new Date()));

const hasOwnedAssessmentMatching = async (idCondition: SQL, sessionHash: string) => {
  const [row] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(idCondition, ownedAssessmentCondition(sessionHash)))
    .limit(1);
  return Boolean(row);
};

const isOwnedAssessment = (assessmentId: string, sessionHash: string) =>
  hasOwnedAssessmentMatching(eq(assessments.id, assessmentId), sessionHash);

const isOwnedVersion = (versionId: string, sessionHash: string) => {
  const assessmentIds = db
    .select({ id: assessmentVersions.assessmentId })
    .from(assessmentVersions)
    .where(eq(assessmentVersions.id, versionId));
  return hasOwnedAssessmentMatching(inArray(assessments.id, assessmentIds), sessionHash);
};

const isOwnedQuestion = (questionId: string, sessionHash: string) => {
  const assessmentIds = db
    .select({ id: assessmentVersions.assessmentId })
    .from(questions)
    .innerJoin(assessmentVersions, eq(questions.assessmentVersionId, assessmentVersions.id))
    .where(eq(questions.id, questionId));
  return hasOwnedAssessmentMatching(inArray(assessments.id, assessmentIds), sessionHash);
};

const isOwnedJob = (jobId: string, sessionHash: string) => {
  const assessmentIds = db
    .select({ id: assessmentVersions.assessmentId })
    .from(questionGenerationJobs)
    .innerJoin(
      assessmentVersions,
      eq(questionGenerationJobs.assessmentVersionId, assessmentVersions.id),
    )
    .where(eq(questionGenerationJobs.id, jobId));
  return hasOwnedAssessmentMatching(inArray(assessments.id, assessmentIds), sessionHash);
};

export const requireAnonymousAssessment: RequestHandler = async (req, res, next) => {
  if (req.method === 'POST' && req.path === '/assessments') {
    return next();
  }

  // There is no public or per-browser assessment listing in the one-time flow.
  if (req.path === '/assessments') {
    return res.status(404).json({ error: 'not found' });
  }

  const token = readSessionToken(req);
  if (!token) {
    return res.status(404).json({ error: 'not found' });
  }
  const sessionHash = hashToken(token);

  const assessmentId = req.path.match(assessmentPath)?.[1];
  const versionId = req.path.match(versionPath)?.[1];
  const questionId = req.path.match(questionPath)?.[1];
  const jobId = req.path.match(jobPath)?.[1];

  const allowed = assessmentId
    ? await isOwnedAssessment(assessmentId, sessionHash)
    : versionId
      ? await isOwnedVersion(versionId, sessionHash)
      : questionId
        ? await isOwnedQuestion(questionId, sessionHash)
        : jobId
          ? await isOwnedJob(jobId, sessionHash)
          : false;

  if (!allowed) {
    return res.status(404).json({ error: 'not found' });
  }

  return next();
};
