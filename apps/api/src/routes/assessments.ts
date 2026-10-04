import { Router } from 'express';

import { assessmentPayloadSchema } from '@clase/shared';

import { uploadAssessmentAsset, type AssetUploadErrorCode } from '../services/asset-service.js';
import {
  createAssessment,
  getAssessmentById,
  updateAssessment,
} from '../services/assessment-service.js';
import { hasValidUploadSignature, upload } from '../lib/upload.js';
import { ASSESSMENT_LIFETIME_MS, startAnonymousSession } from '../lib/anonymous-session.js';
import { limitPublicAction } from '../lib/public-limits.js';

export const assessmentsRouter = Router();

const validateCategory = (input: {
  assessmentCategory?: string | null;
  customCategoryLabel?: string | null;
}) => {
  if (input.assessmentCategory === 'other' && !input.customCategoryLabel) {
    return 'custom_category_label is required when assessment_category is other';
  }

  return null;
};

const assessmentsPayloadSchema = assessmentPayloadSchema;

type UploadFailureClass =
  | 'client_aborted'
  | 'network_reset'
  | 'assessment_not_found'
  | 'idempotency_in_progress'
  | 'idempotency_failed'
  | 'idempotency_replay_lookup_failed'
  | 'storage_upload_failed'
  | 'asset_record_create_failed'
  | 'parsing_job_create_failed'
  | 'queue_enqueue_failed'
  | 'internal_error';

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_-]{8,128}$/;

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'unknown error';
};

const getUploadFailureClass = (input: {
  requestAborted: boolean;
  serviceCode?: AssetUploadErrorCode;
  error?: unknown;
}): UploadFailureClass => {
  if (input.requestAborted) {
    return 'client_aborted';
  }

  if (input.serviceCode) {
    switch (input.serviceCode) {
      case 'ASSESSMENT_NOT_FOUND':
        return 'assessment_not_found';
      case 'STORAGE_UPLOAD_FAILED':
        return 'storage_upload_failed';
      case 'IDEMPOTENCY_IN_PROGRESS':
        return 'idempotency_in_progress';
      case 'IDEMPOTENCY_FAILED':
        return 'idempotency_failed';
      case 'IDEMPOTENCY_REPLAY_LOOKUP_FAILED':
        return 'idempotency_replay_lookup_failed';
      case 'ASSET_RECORD_CREATE_FAILED':
        return 'asset_record_create_failed';
      case 'PARSING_JOB_CREATE_FAILED':
        return 'parsing_job_create_failed';
      case 'QUEUE_ENQUEUE_FAILED':
        return 'queue_enqueue_failed';
      default:
        return 'internal_error';
    }
  }

  const message = getErrorMessage(input.error);
  if (message.includes('ECONNRESET')) {
    return 'network_reset';
  }

  return 'internal_error';
};

assessmentsRouter.get('/:assessmentId', async (req, res) => {
  const assessmentIdParam = req.params.assessmentId;
  const assessmentId = Array.isArray(assessmentIdParam) ? assessmentIdParam[0] : assessmentIdParam;

  if (!assessmentId) {
    return res.status(400).json({ error: 'assessment id is required' });
  }

  const assessment = await getAssessmentById(assessmentId);

  if (!assessment) {
    return res.status(404).json({ error: 'assessment not found' });
  }

  return res.status(200).json(assessment);
});

assessmentsRouter.post('/', limitPublicAction('assessment'), async (req, res) => {
  const parsed = assessmentsPayloadSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.flatten() });
  }

  const categoryError = validateCategory(parsed.data);

  if (categoryError) {
    return res.status(422).json({ error: categoryError });
  }

  const ownerSessionHash = startAnonymousSession(req, res);
  const result = await createAssessment({
    ...parsed.data,
    ownerSessionHash,
    expiresAt: new Date(Date.now() + ASSESSMENT_LIFETIME_MS),
  } as Parameters<typeof createAssessment>[0]);

  return res.status(201).json(result);
});

assessmentsRouter.patch('/:assessmentId', async (req, res) => {
  const assessmentIdParam = req.params.assessmentId;
  const assessmentId = Array.isArray(assessmentIdParam) ? assessmentIdParam[0] : assessmentIdParam;

  if (!assessmentId) {
    return res.status(400).json({ error: 'assessment id is required' });
  }

  const parsed = assessmentsPayloadSchema.partial().safeParse(req.body);

  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.flatten() });
  }

  const categoryError = validateCategory(parsed.data);

  if (categoryError) {
    return res.status(422).json({ error: categoryError });
  }

  const result = await updateAssessment(
    assessmentId,
    parsed.data as Parameters<typeof updateAssessment>[1],
  );

  if (!result) {
    return res.status(404).json({ error: 'assessment not found' });
  }

  return res.status(200).json(result);
});

assessmentsRouter.post(
  '/:assessmentId/assets',
  limitPublicAction('upload'),
  upload.single('file'),
  async (req, res) => {
    const startedAt = Date.now();
    const assessmentIdParam = req.params.assessmentId;
    const assessmentId = Array.isArray(assessmentIdParam)
      ? assessmentIdParam[0]
      : assessmentIdParam;
    const idempotencyKeyHeader = req.header('idempotency-key');
    const idempotencyKey = idempotencyKeyHeader?.trim() || null;
    let requestAborted = false;

    req.on('aborted', () => {
      requestAborted = true;
      req.log?.warn(
        {
          requestId: req.id,
          assessmentId,
        },
        'upload request aborted by client',
      );
    });

    if (!assessmentId) {
      return res.status(400).json({ error: 'assessment id is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    if (!hasValidUploadSignature(req.file)) {
      return res.status(415).json({ error: 'invalid file contents' });
    }

    if (idempotencyKey && !IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)) {
      return res.status(400).json({ error: 'invalid idempotency key' });
    }

    req.log?.info(
      {
        requestId: req.id,
        assessmentId,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        idempotencyKey,
      },
      'asset upload request started',
    );

    try {
      const result = await uploadAssessmentAsset({
        assessmentId,
        file: req.file,
        idempotencyKey: idempotencyKey ?? undefined,
        requestId:
          typeof req.id === 'string' || typeof req.id === 'number' ? String(req.id) : undefined,
        logger: req.log,
      });

      if ('error' in result) {
        const failureClass = getUploadFailureClass({
          requestAborted,
          serviceCode: result.code,
        });

        req.log?.error(
          {
            requestId: req.id,
            assessmentId,
            failureClass,
            errorCode: result.code,
            errorDetails: result.details,
            idempotencyKey,
            durationMs: Date.now() - startedAt,
          },
          'asset upload request failed',
        );

        if (result.code === 'ASSESSMENT_NOT_FOUND') {
          return res.status(404).json({ error: result.error, failureClass });
        }

        if (result.code === 'IDEMPOTENCY_IN_PROGRESS') {
          return res.status(409).json({
            error: result.error,
            failureClass,
            idempotencyStatus: 'processing',
          });
        }

        if (result.code === 'IDEMPOTENCY_FAILED') {
          return res.status(409).json({
            error: result.error,
            failureClass,
            idempotencyStatus: 'failed',
          });
        }

        return res.status(500).json({ error: result.error, failureClass });
      }

      req.log?.info(
        {
          requestId: req.id,
          assessmentId,
          assetFileId: result.assetFile.id,
          parsingJobId: result.parsingJob.id,
          idempotencyKey,
          idempotencyReplay: result.idempotencyReplay,
          durationMs: Date.now() - startedAt,
        },
        'asset upload request completed',
      );

      return res.status(result.idempotencyReplay ? 200 : 201).json({
        ...result,
        idempotencyReplay: result.idempotencyReplay,
      });
    } catch (error) {
      const failureClass = getUploadFailureClass({
        requestAborted,
        error,
      });

      req.log?.error(
        {
          requestId: req.id,
          assessmentId,
          failureClass,
          idempotencyKey,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'asset upload request crashed',
      );

      if (requestAborted || failureClass === 'network_reset') {
        return res.status(503).json({
          error: 'connection interrupted',
          failureClass,
        });
      }

      return res.status(500).json({ error: 'internal server error', failureClass });
    }
  },
);
