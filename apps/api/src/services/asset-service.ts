import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { and, eq } from 'drizzle-orm';

import {
  assessmentUploadRequests,
  assetFiles,
  assessments,
  db,
  parsingJobs,
} from '@clase/shared/server';
import { buildAssetPath } from '../lib/storage.js';
import { parsingQueue } from '../lib/queue.js';
import { storageBucket, supabase } from '../lib/supabase.js';

export type AssetUploadSuccessResult = {
  assessmentId: string;
  assetFile: typeof assetFiles.$inferSelect;
  parsingJob: typeof parsingJobs.$inferSelect;
  idempotencyReplay: boolean;
};

export type AssetUploadErrorCode =
  | 'ASSESSMENT_NOT_FOUND'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'IDEMPOTENCY_FAILED'
  | 'IDEMPOTENCY_REPLAY_LOOKUP_FAILED'
  | 'STORAGE_UPLOAD_FAILED'
  | 'ASSET_RECORD_CREATE_FAILED'
  | 'PARSING_JOB_CREATE_FAILED'
  | 'QUEUE_ENQUEUE_FAILED';

export type AssetUploadErrorResult = {
  error: string;
  code: AssetUploadErrorCode;
  details?: unknown;
};

type AssetUploadLogger = {
  info?: (obj: Record<string, unknown>, msg?: string) => void;
  warn?: (obj: Record<string, unknown>, msg?: string) => void;
};

const toErrorDetails = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return error;
};

const isUniqueConstraintViolation = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return 'code' in error && (error as { code?: string }).code === '23505';
};

const markUploadRequestFailed = async (uploadRequestId: string | null, errorMessage: string) => {
  if (!uploadRequestId) {
    return;
  }

  await db
    .update(assessmentUploadRequests)
    .set({
      status: 'failed',
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(assessmentUploadRequests.id, uploadRequestId));
};

export const uploadAssessmentAsset = async (input: {
  assessmentId: string;
  file: Express.Multer.File;
  idempotencyKey?: string;
  requestId?: string;
  logger?: AssetUploadLogger;
}) => {
  const startedAt = performance.now();
  let supabaseUploadMs: number | null = null;
  let assetInsertMs: number | null = null;
  let parsingJobInsertMs: number | null = null;
  let queueEnqueueMs: number | null = null;

  const stageTimings = () => ({
    supabaseUploadMs,
    assetInsertMs,
    parsingJobInsertMs,
    queueEnqueueMs,
    elapsedMs: Math.round(performance.now() - startedAt),
  });

  const logFailure = (errorCode: AssetUploadErrorCode, extra?: Record<string, unknown>) => {
    input.logger?.warn?.(
      {
        requestId: input.requestId,
        assessmentId: input.assessmentId,
        errorCode,
        stageTimings: stageTimings(),
        ...extra,
      },
      'asset upload service failed',
    );
  };

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, input.assessmentId))
    .limit(1);

  if (!assessment) {
    logFailure('ASSESSMENT_NOT_FOUND');

    return {
      error: 'assessment not found',
      code: 'ASSESSMENT_NOT_FOUND',
    } as const satisfies AssetUploadErrorResult;
  }

  let uploadRequestId: string | null = null;

  if (input.idempotencyKey) {
    try {
      const [createdUploadRequest] = await db
        .insert(assessmentUploadRequests)
        .values({
          assessmentId: input.assessmentId,
          idempotencyKey: input.idempotencyKey,
          status: 'processing',
        })
        .returning({ id: assessmentUploadRequests.id });

      uploadRequestId = createdUploadRequest?.id ?? null;
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      const [existingUploadRequest] = await db
        .select()
        .from(assessmentUploadRequests)
        .where(
          and(
            eq(assessmentUploadRequests.assessmentId, input.assessmentId),
            eq(assessmentUploadRequests.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);

      if (!existingUploadRequest) {
        return {
          error: 'idempotent upload request lookup failed',
          code: 'IDEMPOTENCY_REPLAY_LOOKUP_FAILED',
        } as const satisfies AssetUploadErrorResult;
      }

      if (existingUploadRequest.status === 'processing') {
        return {
          error: 'upload already in progress for this request',
          code: 'IDEMPOTENCY_IN_PROGRESS',
        } as const satisfies AssetUploadErrorResult;
      }

      if (existingUploadRequest.status === 'failed') {
        return {
          error: 'previous upload attempt failed; retry with a new upload attempt',
          code: 'IDEMPOTENCY_FAILED',
          details: {
            errorMessage: existingUploadRequest.errorMessage,
          },
        } as const satisfies AssetUploadErrorResult;
      }

      if (!existingUploadRequest.assetFileId || !existingUploadRequest.parsingJobId) {
        return {
          error: 'idempotent upload request is missing linked records',
          code: 'IDEMPOTENCY_REPLAY_LOOKUP_FAILED',
        } as const satisfies AssetUploadErrorResult;
      }

      const [assetFile] = await db
        .select()
        .from(assetFiles)
        .where(eq(assetFiles.id, existingUploadRequest.assetFileId))
        .limit(1);
      const [parsingJob] = await db
        .select()
        .from(parsingJobs)
        .where(eq(parsingJobs.id, existingUploadRequest.parsingJobId))
        .limit(1);

      if (!assetFile || !parsingJob) {
        return {
          error: 'idempotent upload replay records not found',
          code: 'IDEMPOTENCY_REPLAY_LOOKUP_FAILED',
        } as const satisfies AssetUploadErrorResult;
      }

      return {
        assessmentId: input.assessmentId,
        assetFile,
        parsingJob,
        idempotencyReplay: true,
      } as const satisfies AssetUploadSuccessResult;
    }
  }

  const assetId = randomUUID();
  const storagePath = buildAssetPath({
    assessmentId: input.assessmentId,
    assetId,
    originalName: input.file.originalname,
  });

  const uploadResult = await supabase.storage
    .from(storageBucket)
    .upload(storagePath, input.file.buffer, {
      contentType: input.file.mimetype,
      upsert: false,
    });
  supabaseUploadMs = Math.round(performance.now() - startedAt);

  if (uploadResult.error) {
    logFailure('STORAGE_UPLOAD_FAILED');

    await markUploadRequestFailed(uploadRequestId, 'failed to upload asset');
    return {
      error: 'failed to upload asset',
      code: 'STORAGE_UPLOAD_FAILED',
      details: uploadResult.error,
    } as const satisfies AssetUploadErrorResult;
  }

  const sourceType = (() => {
    switch (input.file.mimetype) {
      case 'application/pdf':
        return 'pdf';
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return 'docx';
      default:
        return 'manual';
    }
  })();

  const assetInsertStart = performance.now();
  const [assetFile] = await db
    .insert(assetFiles)
    .values({
      assessmentId: input.assessmentId,
      storageUrl: storagePath,
      mimeType: input.file.mimetype,
      sourceType,
    })
    .returning();
  assetInsertMs = Math.round(performance.now() - assetInsertStart);

  if (!assetFile) {
    await supabase.storage.from(storageBucket).remove([storagePath]);
    await markUploadRequestFailed(uploadRequestId, 'failed to create asset record');
    logFailure('ASSET_RECORD_CREATE_FAILED');

    return {
      error: 'failed to create asset record',
      code: 'ASSET_RECORD_CREATE_FAILED',
    } as const satisfies AssetUploadErrorResult;
  }

  const parsingJobInsertStart = performance.now();
  const [parsingJob] = await db
    .insert(parsingJobs)
    .values({
      assetFileId: assetFile.id,
      status: 'queued',
    })
    .returning();
  parsingJobInsertMs = Math.round(performance.now() - parsingJobInsertStart);

  if (!parsingJob) {
    await db.delete(assetFiles).where(eq(assetFiles.id, assetFile.id));
    await supabase.storage.from(storageBucket).remove([storagePath]);
    await markUploadRequestFailed(uploadRequestId, 'failed to create parsing job');
    logFailure('PARSING_JOB_CREATE_FAILED', { assetFileId: assetFile.id });

    return {
      error: 'failed to create parsing job',
      code: 'PARSING_JOB_CREATE_FAILED',
    } as const satisfies AssetUploadErrorResult;
  }

  try {
    const queueEnqueueStart = performance.now();
    await parsingQueue.add('parse-asset', {
      assetFileId: assetFile.id,
    });
    queueEnqueueMs = Math.round(performance.now() - queueEnqueueStart);
  } catch (error) {
    await db
      .update(parsingJobs)
      .set({
        status: 'failed',
        errorMessage: 'failed to enqueue parsing job',
      })
      .where(eq(parsingJobs.id, parsingJob.id));

    await markUploadRequestFailed(uploadRequestId, 'failed to enqueue parsing job');

    logFailure('QUEUE_ENQUEUE_FAILED', {
      assetFileId: assetFile.id,
      parsingJobId: parsingJob.id,
    });

    return {
      error: 'failed to enqueue parsing job',
      code: 'QUEUE_ENQUEUE_FAILED',
      details: toErrorDetails(error),
    } as const satisfies AssetUploadErrorResult;
  }

  if (uploadRequestId) {
    await db
      .update(assessmentUploadRequests)
      .set({
        status: 'success',
        assetFileId: assetFile.id,
        parsingJobId: parsingJob.id,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(assessmentUploadRequests.id, uploadRequestId));
  }

  input.logger?.info?.(
    {
      requestId: input.requestId,
      assessmentId: input.assessmentId,
      assetFileId: assetFile.id,
      parsingJobId: parsingJob.id,
      idempotencyReplay: false,
      stageTimings: stageTimings(),
    },
    'asset upload service completed',
  );

  return {
    assessmentId: input.assessmentId,
    assetFile,
    parsingJob,
    idempotencyReplay: false,
  } as const satisfies AssetUploadSuccessResult;
};
