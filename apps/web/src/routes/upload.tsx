import { useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateAssessment, useUploadAssessmentAsset } from '@/lib/assessment-api';
import { cn } from '@/lib/utils';
import { getEditorUploadParsingGateKey } from '@/ui/editor/editor-constants';
import { useAppCopy } from '@/ui/use-app-copy';

const ACCEPTED_EXTENSIONS = ['pdf', 'docx'];
const UPLOAD_ATTEMPT_TTL_MS = 6 * 60 * 60 * 1000;
const UPLOAD_ATTEMPT_STORAGE_PREFIX = 'upload-attempt';
const SAMPLE_PDFS = [{ id: 'demo', fileName: 'clase-demo-worksheet.pdf' }];

const getBaseTitle = (fileName: string) => fileName.replace(/\.[^/.]+$/, '').trim();
const getFileExtension = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? '';
const getSamplePdfHref = (fileName: string) => `/samples/${encodeURIComponent(fileName)}`;

const isValidFile = (file: File) => ACCEPTED_EXTENSIONS.includes(getFileExtension(file.name));

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

const createUploadAttemptKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const getFileFingerprint = (file: File) =>
  [file.name, file.size, file.lastModified, file.type].join('|');

type PersistedUploadAttempt = {
  key: string;
  fingerprint: string;
  updatedAt: number;
};

const getUploadAttemptStorageKey = (assessmentId: string) =>
  `${UPLOAD_ATTEMPT_STORAGE_PREFIX}:${assessmentId}`;

const readPersistedUploadAttempt = (assessmentId: string): PersistedUploadAttempt | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(getUploadAttemptStorageKey(assessmentId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedUploadAttempt;
    if (
      typeof parsed.key !== 'string' ||
      typeof parsed.fingerprint !== 'string' ||
      typeof parsed.updatedAt !== 'number'
    ) {
      window.sessionStorage.removeItem(getUploadAttemptStorageKey(assessmentId));
      return null;
    }

    if (Date.now() - parsed.updatedAt > UPLOAD_ATTEMPT_TTL_MS) {
      window.sessionStorage.removeItem(getUploadAttemptStorageKey(assessmentId));
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(getUploadAttemptStorageKey(assessmentId));
    return null;
  }
};

const writePersistedUploadAttempt = (assessmentId: string, attempt: PersistedUploadAttempt) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(getUploadAttemptStorageKey(assessmentId), JSON.stringify(attempt));
};

const clearPersistedUploadAttempt = (assessmentId: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(getUploadAttemptStorageKey(assessmentId));
};

export const UploadRoute = () => {
  const copy = useAppCopy();
  const navigate = useNavigate();
  const searchString = useRouterState({ select: (state) => state.location.searchStr });
  const createAssessmentMutation = useCreateAssessment();
  const uploadAssessmentAssetMutation = useUploadAssessmentAsset();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadAttemptKey, setUploadAttemptKey] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [sampleLoadingId, setSampleLoadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeAssessmentId = new URLSearchParams(searchString).get('assessmentId');
  const isUploading = createAssessmentMutation.isPending || uploadAssessmentAssetMutation.isPending;

  const handleSelectedFile = (file: File) => {
    if (!isValidFile(file)) {
      setSelectedFile(null);
      setUploadError(copy.upload.invalidFile);
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
    setUploadAttemptKey(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file) handleSelectedFile(file);
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isUploading) return;
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) handleSelectedFile(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isUploading) return;
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleDropZoneKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isUploading) return;
      fileInputRef.current?.click();
    }
  };

  const handleBrowseClick = () => {
    if (isUploading) return;
    fileInputRef.current?.click();
  };

  const handleSampleSelect = async (sample: { id: string; fileName: string }) => {
    if (isUploading || sampleLoadingId) return;
    setSampleLoadingId(sample.id);
    setUploadError(null);

    try {
      const response = await fetch(`/samples/${sample.fileName}`);
      if (!response.ok) {
        throw new Error('Sample PDF fetch failed');
      }
      const blob = await response.blob();
      const file = new File([blob], sample.fileName, {
        type: blob.type || 'application/pdf',
      });
      handleSelectedFile(file);
    } catch {
      setUploadError(copy.upload.sampleFetchFailed);
    } finally {
      setSampleLoadingId(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError(copy.upload.selectFileError);
      return;
    }

    setUploadError(null);

    let attemptedAssessmentId: string | null = activeAssessmentId;

    try {
      let targetAssessmentId = activeAssessmentId;

      if (!targetAssessmentId) {
        const title = getBaseTitle(selectedFile.name) || copy.upload.untitledAssessment;
        const created = await createAssessmentMutation.mutateAsync({ title });
        targetAssessmentId = created.id;

        await navigate({
          to: '/',
          search: { assessmentId: targetAssessmentId },
          replace: true,
        });
      }

      attemptedAssessmentId = targetAssessmentId;

      const fingerprint = getFileFingerprint(selectedFile);
      const persistedAttempt = readPersistedUploadAttempt(targetAssessmentId);
      const persistedAttemptKey =
        persistedAttempt?.fingerprint === fingerprint ? persistedAttempt.key : null;
      const currentAttemptKey = uploadAttemptKey ?? persistedAttemptKey ?? createUploadAttemptKey();

      if (uploadAttemptKey !== currentAttemptKey) {
        setUploadAttemptKey(currentAttemptKey);
      }

      writePersistedUploadAttempt(targetAssessmentId, {
        key: currentAttemptKey,
        fingerprint,
        updatedAt: Date.now(),
      });

      await uploadAssessmentAssetMutation.mutateAsync({
        assessmentId: targetAssessmentId,
        file: selectedFile,
        idempotencyKey: currentAttemptKey,
      });

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(getEditorUploadParsingGateKey(targetAssessmentId), '1');
      }

      setUploadAttemptKey(null);
      clearPersistedUploadAttempt(targetAssessmentId);
      await navigate({
        to: '/editor/$assessmentId',
        params: { assessmentId: targetAssessmentId },
      });
    } catch (error) {
      const status =
        typeof error === 'object' && error && 'status' in error
          ? Number((error as { status?: unknown }).status)
          : null;
      const message =
        typeof error === 'object' &&
        error &&
        'message' in error &&
        typeof error.message === 'string'
          ? error.message
          : '';
      const normalizedMessage = message.toLowerCase();
      const idempotencyStatus =
        typeof error === 'object' &&
        error &&
        'details' in error &&
        typeof (error as { details?: unknown }).details === 'object' &&
        (error as { details?: { idempotencyStatus?: string } }).details?.idempotencyStatus
          ? String(
              (error as { details?: { idempotencyStatus?: string } }).details?.idempotencyStatus,
            )
          : null;

      if (status === 409 && idempotencyStatus === 'processing') {
        setUploadError(copy.upload.uploadInProgress);
        return;
      }

      if (status === 409 && idempotencyStatus === 'failed') {
        setUploadAttemptKey(null);
        if (attemptedAssessmentId) {
          clearPersistedUploadAttempt(attemptedAssessmentId);
        }
        setUploadError(copy.upload.uploadRetryNewAttempt);
        return;
      }

      if (
        status === 0 ||
        status === 503 ||
        normalizedMessage.includes('econnreset') ||
        normalizedMessage.includes('failed to fetch') ||
        normalizedMessage.includes('networkerror') ||
        normalizedMessage.includes('connection interrupted')
      ) {
        setUploadError(`${copy.upload.uploadInterrupted} ${copy.upload.uploadRetryHint}`);
        return;
      }

      if (
        status === 408 ||
        normalizedMessage.includes('timed out') ||
        normalizedMessage.includes('timeout')
      ) {
        setUploadError(`${copy.upload.uploadTimeout} ${copy.upload.uploadRetryHint}`);
        return;
      }

      if (message) {
        setUploadError(message);
        return;
      }

      setUploadError(copy.upload.uploadFailed);
    }
  };

  const selectedExtension = selectedFile ? getFileExtension(selectedFile.name) : '';
  const selectedSize = selectedFile ? formatFileSize(selectedFile.size) : '';

  return (
    <section className="w-full max-w-full space-y-5 overflow-x-hidden sm:space-y-6 md:space-y-8">
      <div className="relative w-full max-w-full overflow-hidden rounded-3xl border border-[#e1d6c8] bg-[#f6f1e8] px-4 py-5 shadow-[0_14px_34px_-26px_rgba(43,38,33,0.35)] sm:px-6 sm:py-6 sm:shadow-[0_25px_60px_-55px_rgba(43,38,33,0.8)] md:px-9 md:py-7">
        <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-[#e7c1a9]/70 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-40 w-40 rounded-full bg-[#c86b3c]/10 blur-3xl" />
        <div className="relative z-10 space-y-4 sm:space-y-5">
          <p className="text-[0.65rem] uppercase tracking-[0.18em] text-[#8b7a69] sm:text-xs sm:tracking-[0.3em]">
            {copy.upload.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold leading-tight text-[#2b2621] font-[var(--font-display)] sm:mt-2 sm:text-3xl md:text-4xl">
            {copy.upload.title}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6b5c4d] sm:mt-3 sm:max-w-2xl md:text-base">
            {copy.upload.subtitle}
          </p>
          <div className="rounded-2xl border border-[#e7dccf] bg-white/70 p-3.5 sm:p-4">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#8b7a69] sm:text-[0.65rem] sm:tracking-[0.22em]">
              {copy.upload.flowTitle}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#6b5c4d]">{copy.upload.flowBody}</p>
            <ol className="mt-3 grid min-w-0 gap-2.5 md:grid-cols-2">
              {[
                copy.upload.flowSteps.upload,
                copy.upload.flowSteps.extract,
                copy.upload.flowSteps.edit,
                copy.upload.flowSteps.print,
              ].map((step, index) => (
                <li
                  key={step}
                  className="flex items-center gap-2 rounded-xl border border-[#e7dccf] bg-[#fcfaf5] px-3 py-2.5"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#dfc4ac] bg-white text-xs font-semibold text-[#8f3f1d]">
                    {index + 1}
                  </span>
                  <span className="text-xs leading-snug text-[#4b3f34] sm:text-sm">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <div className="grid w-full max-w-full gap-6">
        <Card className="w-full max-w-full rounded-3xl border border-[#e1d6c8] bg-white/90 ring-0 shadow-[0_14px_34px_-26px_rgba(43,38,33,0.32)] sm:shadow-[0_24px_80px_-65px_rgba(43,38,33,0.55)]">
          <CardHeader>
            <CardTitle className="text-[#2b2621]">{copy.upload.dropTitle}</CardTitle>
            <CardDescription className="text-[#6b5c4d]">{copy.upload.dropBody}</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4 sm:space-y-5">
            <div
              role="button"
              tabIndex={0}
              aria-disabled={isUploading}
              onClick={handleBrowseClick}
              onKeyDown={handleDropZoneKey}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                'group flex min-h-[168px] w-full min-w-0 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-4 py-6 text-center transition sm:min-h-[190px] sm:px-6 sm:py-7 md:min-h-[200px] md:py-8',
                isDragActive
                  ? 'border-[#c86b3c] bg-[#f7e1d2]'
                  : 'border-[#e1d6c8] bg-[#fcfaf5] hover:border-[#c86b3c] hover:bg-[#f9efe4]',
                isUploading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#e7c1a9] bg-white text-[#c86b3c] shadow-sm">
                <span className="text-lg font-semibold">+</span>
              </div>
              <p className="text-base font-semibold text-[#2b2621]">{copy.upload.dropAction}</p>
              <p className="max-w-sm text-xs leading-relaxed text-[#6b5c4d]">
                {copy.upload.dropHint}
              </p>
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[#c86b3c] sm:text-xs sm:tracking-[0.3em]">
                {copy.upload.dropBrowse}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-[#e1d6c8] text-[#6b5c4d]">
                  PDF
                </Badge>
                <Badge variant="outline" className="border-[#e1d6c8] text-[#6b5c4d]">
                  DOCX
                </Badge>
              </div>
            </div>

            <Label htmlFor="file-upload" className="sr-only">
              {copy.upload.uploadFileLabel}
            </Label>
            <Input
              id="file-upload"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={handleFileChange}
              className="sr-only"
            />

            {selectedFile ? (
              <div className="flex w-full max-w-full min-w-0 flex-col items-start gap-3 rounded-2xl border border-[#e1d6c8] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[#8b7a69]">
                    {copy.upload.selectedFileLabel}
                  </p>
                  <p className="mt-1 break-all text-sm font-semibold text-[#2b2621]">
                    {selectedFile.name}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6b5c4d]">
                    {selectedExtension ? (
                      <Badge variant="outline" className="border-[#e1d6c8] text-[#6b5c4d]">
                        {selectedExtension.toUpperCase()}
                      </Badge>
                    ) : null}
                    {selectedSize ? <span>{selectedSize}</span> : null}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBrowseClick}
                  className="w-full border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c] sm:w-auto"
                >
                  {copy.upload.replaceFile}
                </Button>
              </div>
            ) : null}

            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="w-full bg-[#c86b3c] text-white hover:bg-[#b45d33] sm:w-auto"
              >
                {isUploading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    {copy.upload.uploadingButton}
                  </span>
                ) : (
                  copy.upload.uploadButton
                )}
              </Button>
              {uploadError ? (
                <span className="w-full break-words text-xs leading-relaxed text-rose-600 sm:w-auto">
                  {uploadError}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-[#6b5c4d]">{copy.upload.uploadHelper}</p>
            <p className="text-xs text-[#6b5c4d]">{copy.upload.retentionNotice}</p>
            <p className="text-xs text-[#6b5c4d]">{copy.upload.providerNotice}</p>
            <div className="min-w-0 rounded-2xl border border-[#e1d6c8] bg-[#fcfaf5] px-4 py-3 text-xs text-[#6b5c4d]">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[#8b7a69]">
                {copy.upload.sampleSourcesTitle}
              </p>
              <p className="mt-2">{copy.upload.sampleSourcesBody}</p>
              <div className="mt-3 flex flex-col gap-2 text-xs font-semibold">
                {SAMPLE_PDFS.map((sample) => (
                  <div key={sample.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSampleSelect(sample)}
                      disabled={isUploading || sampleLoadingId !== null}
                      className="border-[#d8ccbd] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#8f3f1d]"
                    >
                      {sampleLoadingId === sample.id
                        ? copy.upload.sampleUseLoading
                        : copy.upload.sampleUseButton(copy.upload.sampleLabel)}
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="border-[#d8ccbd] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#8f3f1d]"
                    >
                      <a
                        href={getSamplePdfHref(sample.fileName)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {copy.upload.samplePreviewButton}
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
