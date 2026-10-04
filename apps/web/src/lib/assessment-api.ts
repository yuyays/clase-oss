import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './api-client';

export type AssessmentCategory = 'quiz' | 'midterm' | 'final' | 'practice' | 'other' | null;

export type Assessment = {
  id: string;
  title: string;
  description: string | null;
  assessmentCategory: AssessmentCategory;
  customCategoryLabel: string | null;
  subject: string | null;
  grade: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  latestDraftVersionId?: string | null;
};

export type AssessmentPayload = {
  title: string;
  description?: string | null;
  assessmentCategory?: AssessmentCategory;
  customCategoryLabel?: string | null;
  subject?: string | null;
  grade?: string | null;
};

export type AssessmentVersion = {
  id: string;
  assessmentId: string;
  versionNumber: number;
  status: 'draft' | 'published';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CorrectAnswer = {
  label: string | null;
  text: string | null;
};

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'written' | 'other';

export type Question = {
  id?: string;
  assessmentVersionId?: string;
  type: QuestionType;
  prompt: string;
  choices: string[] | null;
  correctAnswer: CorrectAnswer;
  points: number | null;
  orderIndex: number;
  createdAt?: string;
  updatedAt?: string;
};

export type DraftQuestionsResponse = {
  assessmentVersion: AssessmentVersion | null;
  questions: Question[];
};

export type QuestionGenerationJob = {
  id: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  errorMessage: string | null;
  updatedAt: string;
  mode?: 'replace' | 'insert';
  style?: 'rewrite' | 'similar';
  resultQuestionId?: string | null;
  queueWaitMs?: number | null;
  dbReadMs?: number | null;
  dbWriteMs?: number | null;
  elapsedMs?: number | null;
  llmDurationMs?: number | null;
  llmInputTokens?: number | null;
  llmOutputTokens?: number | null;
  llmTotalTokens?: number | null;
  llmProviderRequestId?: string | null;
};

export type RegenerateQuestionResponse = {
  jobId: string;
  status: 'queued' | 'running' | 'success' | 'failed';
};

export type ParsingStatus = {
  status: 'not_started' | 'queued' | 'running' | 'success' | 'failed';
  errorMessage?: string | null;
  questionCount?: number;
  parser?: string | null;
  elapsedMs?: number | null;
  queueWaitMs?: number | null;
  llmMs?: number | null;
  llmPath?: 'text' | 'file' | 'heuristic' | null;
  llmModel?: string | null;
  llmProviderRequestId?: string | null;
  llmOpenAiFileUploadMs?: number | null;
  llmOpenAiResponsesMs?: number | null;
  updatedAt?: string | null;
};

export type UploadAssessmentAssetResponse = {
  assessmentId: string;
  idempotencyReplay?: boolean;
  assetFile: {
    id: string;
    filename?: string | null;
    mimeType?: string | null;
    size?: number | null;
    storagePath?: string | null;
  };
  parsingJob: {
    id: string;
    status: string;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
};

const getAssessment = (assessmentId: string) =>
  apiFetch<Assessment>(`/assessments/${assessmentId}`);

const getDraftQuestions = (assessmentId: string) =>
  apiFetch<DraftQuestionsResponse>(`/assessments/${assessmentId}/questions`);

const createAssessment = (payload: AssessmentPayload) =>
  apiFetch<Assessment>('/assessments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

const updateAssessment = (assessmentId: string, payload: Partial<AssessmentPayload>) =>
  apiFetch<Assessment>(`/assessments/${assessmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

const createDraftVersion = (assessmentId: string) =>
  apiFetch<AssessmentVersion>(`/assessments/${assessmentId}/versions`, {
    method: 'POST',
  });

const replaceDraftQuestions = (assessmentVersionId: string, questions: Question[]) =>
  apiFetch<DraftQuestionsResponse>(`/assessment-versions/${assessmentVersionId}/questions`, {
    method: 'PUT',
    body: JSON.stringify(questions),
  });

const publishAssessment = (assessmentId: string) =>
  apiFetch<AssessmentVersion>(`/assessments/${assessmentId}/publish`, {
    method: 'POST',
  });

const uploadAssessmentAsset = (
  assessmentId: string,
  file: File,
  options?: { idempotencyKey?: string },
) => {
  const formData = new FormData();
  formData.append('file', file);

  const headers = new Headers();
  if (options?.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }

  return apiFetch<UploadAssessmentAssetResponse>(`/assessments/${assessmentId}/assets`, {
    method: 'POST',
    body: formData,
    headers,
  });
};

const getParsingStatus = (assessmentId: string) =>
  apiFetch<ParsingStatus>(`/assessments/${assessmentId}/parsing-status`);

const regenerateQuestion = (
  questionId: string,
  targetCorrectRate: number,
  mode: 'replace' | 'insert',
  style: 'rewrite' | 'similar',
) =>
  apiFetch<RegenerateQuestionResponse>(`/questions/${questionId}/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ targetCorrectRate, mode, style }),
  });

const getQuestionGenerationJob = (jobId: string) =>
  apiFetch<QuestionGenerationJob>(`/question-generation-jobs/${jobId}`);

export const useAssessment = (assessmentId?: string | null) =>
  useQuery({
    queryKey: ['assessment', assessmentId],
    queryFn: () => getAssessment(assessmentId as string),
    enabled: Boolean(assessmentId),
    retry: false,
    refetchOnWindowFocus: false,
  });

export const useDraftQuestions = (assessmentId?: string | null) =>
  useQuery({
    queryKey: ['assessment-questions', assessmentId],
    queryFn: () => getDraftQuestions(assessmentId as string),
    enabled: Boolean(assessmentId),
    retry: false,
    refetchOnWindowFocus: false,
  });

export const useCreateAssessment = () => useMutation({ mutationFn: createAssessment });

export const useUpdateAssessment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assessmentId,
      payload,
    }: {
      assessmentId: string;
      payload: Partial<AssessmentPayload>;
    }) => updateAssessment(assessmentId, payload),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ['assessment', variables.assessmentId] }),
  });
};

export const useCreateDraftVersion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assessmentId }: { assessmentId: string }) => createDraftVersion(assessmentId),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assessment', variables.assessmentId] }),
        queryClient.invalidateQueries({
          queryKey: ['assessment-questions', variables.assessmentId],
        }),
      ]);
    },
  });
};

export const useReplaceDraftQuestions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assessmentVersionId,
      questions,
    }: {
      assessmentVersionId: string;
      questions: Question[];
    }) => replaceDraftQuestions(assessmentVersionId, questions),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assessment-questions'] }),
  });
};

export const usePublishAssessment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assessmentId }: { assessmentId: string }) => publishAssessment(assessmentId),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assessment', variables.assessmentId] }),
        queryClient.invalidateQueries({
          queryKey: ['assessment-questions', variables.assessmentId],
        }),
      ]);
    },
  });
};

export const useUploadAssessmentAsset = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assessmentId,
      file,
      idempotencyKey,
    }: {
      assessmentId: string;
      file: File;
      idempotencyKey?: string;
    }) => uploadAssessmentAsset(assessmentId, file, { idempotencyKey }),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assessment', variables.assessmentId] }),
        queryClient.invalidateQueries({
          queryKey: ['assessment-questions', variables.assessmentId],
        }),
        queryClient.invalidateQueries({ queryKey: ['parsing-status', variables.assessmentId] }),
      ]);
    },
  });
};

type ParsingStatusQueryOptions = {
  pollNotStarted?: boolean;
};

export const useParsingStatus = (
  assessmentId?: string | null,
  enabled = true,
  options?: ParsingStatusQueryOptions,
) =>
  useQuery({
    queryKey: ['parsing-status', assessmentId],
    queryFn: () => getParsingStatus(assessmentId as string),
    enabled: Boolean(assessmentId && enabled),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return false;
      if (status === 'queued' || status === 'running') {
        return 1500;
      }
      if (status === 'not_started') {
        return options?.pollNotStarted ? 2000 : false;
      }
      return false;
    },
  });

export const useRegenerateQuestion = () =>
  useMutation({
    mutationFn: ({
      questionId,
      targetCorrectRate,
      mode,
      style,
    }: {
      questionId: string;
      targetCorrectRate: number;
      mode: 'replace' | 'insert';
      style: 'rewrite' | 'similar';
    }) => regenerateQuestion(questionId, targetCorrectRate, mode, style),
  });

export const useQuestionGenerationJob = (jobId?: string | null, enabled = true) =>
  useQuery({
    queryKey: ['question-generation-job', jobId],
    queryFn: () => getQuestionGenerationJob(jobId as string),
    enabled: Boolean(jobId && enabled),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return false;
      if (status === 'queued' || status === 'running') {
        return 2500;
      }
      return false;
    },
  });
