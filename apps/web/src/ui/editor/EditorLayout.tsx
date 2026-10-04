import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import type { Assessment, DraftQuestionsResponse, Question } from '@/lib/assessment-api';
import {
  useParsingStatus,
  useQuestionGenerationJob,
  useRegenerateQuestion,
} from '@/lib/assessment-api';
import { useEditorDraft, type DraftQuestion } from '@/lib/use-editor-draft';
import { useEditorLayoutPreference } from '@/lib/use-editor-layout';
import { useLocalStorage } from '@/lib/use-local-storage';
import { useQuestionMetrics } from '@/lib/use-question-metrics';
import { cn } from '@/lib/utils';
import { useLocale } from '@/ui/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MathText } from '@/components/math-text';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { AssessmentDetailsCard } from './AssessmentDetailsCard';
import { EditorHeader } from './EditorHeader';
import { getEditorUploadParsingGateKey } from './editor-constants';
import { QuestionEditorCard } from './QuestionEditorCard';
import { QuestionInspectorPanel } from './QuestionInspectorPanel';
import { QuestionListPanel } from './QuestionListPanel';
import { QuestionMetricsPanel } from './QuestionMetricsPanel';
import {
  findNextQuestionByIndex,
  findNextUnreviewedQuestion,
  getQuestionReviewStatus,
} from './question-review';
import { useEditorCopy } from './use-editor-copy';

const EMPTY_TYPE_COUNTS: Record<Question['type'], number> = {
  multiple_choice: 0,
  true_false: 0,
  short_answer: 0,
  written: 0,
  other: 0,
};

const FETCH_LOADER_MIN_MS = 500;

type EditorLayoutProps = {
  assessments: Assessment[];
  selectedAssessmentId: string | null;
  onSelectAssessment: (assessmentId: string) => void;
  assessment: Assessment | null;
  questions: Question[];
  assessmentVersionId: string | null;
  isLoading: boolean;
  ready: boolean;
};

export const EditorLayout = ({
  assessments,
  selectedAssessmentId,
  onSelectAssessment,
  assessment,
  questions,
  assessmentVersionId,
  isLoading,
  ready,
}: EditorLayoutProps) => {
  const [now, setNow] = useState(() => Date.now());
  const { layout, setLayout } = useEditorLayoutPreference();
  const copy = useEditorCopy();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [isStudentView, setIsStudentView] = useLocalStorage('editor-student-view', false);
  const [showAnswers, setShowAnswers] = useLocalStorage('editor-student-view-answers', false);
  const [showPoints, setShowPoints] = useLocalStorage('editor-student-view-points', false);
  const [isAssessmentDrawerOpen, setIsAssessmentDrawerOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'questions' | 'editor'>('questions');
  const [generationJobId, setGenerationJobId] = useState<string | null>(null);
  const [generationStyle, setGenerationStyle] = useState<'rewrite' | 'similar' | null>(null);
  const [hasUploadParsingGate, setHasUploadParsingGate] = useState(false);
  const [focusedPreviewQuestionId, setFocusedPreviewQuestionId] = useState<string | null>(null);
  const parsingSyncKeyRef = useRef<string | null>(null);
  const handledFailedGenerationJobRef = useRef<string | null>(null);
  const previewQuestionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previewFocusTimeoutRef = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const parsingAssessmentId = assessment?.id ?? null;
  const { data: parsingStatus } = useParsingStatus(
    parsingAssessmentId,
    Boolean(parsingAssessmentId),
    {
      pollNotStarted: hasUploadParsingGate,
    },
  );
  const isParsingInProgress =
    parsingStatus?.status === 'queued' || parsingStatus?.status === 'running';
  const hasParsingFailed = parsingStatus?.status === 'failed';
  const {
    draft,
    selectedQuestion,
    selectedQuestionId,
    selectedQuestionIndex,
    actionError,
    actionNotice,
    isDirty,
    isSaving,
    pendingAction,
    lastSavedAt,
    setSelectedQuestionId,
    handleAssessmentChange,
    handleDiscardChanges,
    handleAddQuestion,
    handleDeleteQuestion,
    handleMoveQuestion,
    handleReorderQuestion,
    handleQuestionTypeChange,
    handleQuestionPromptChange,
    handleAddChoice,
    handleChoiceChange,
    handleChoiceRemove,
    handleCorrectAnswerChange,
    handlePointsChange,
    handleSaveDraft,
    handleReplaceQuestionsFromServer,
    showActionNotice,
    showActionError,
  } = useEditorDraft({
    assessments,
    assessment,
    questions,
    assessmentVersionId,
    selectedAssessmentId,
    isQuestionEditingLocked: isParsingInProgress,
    onSelectAssessment,
  });

  const regenerateQuestionMutation = useRegenerateQuestion();
  const { data: generationJob } = useQuestionGenerationJob(generationJobId, true);

  const { getQuestionMetrics, averageCorrectRate } = useQuestionMetrics(
    selectedAssessmentId,
    draft.questions,
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (previewFocusTimeoutRef.current !== null) {
        window.clearTimeout(previewFocusTimeoutRef.current);
      }
    };
  }, []);

  const formatRelativeTime = (value: Date) => {
    const diff = now - value.getTime();
    if (diff < 60_000) return copy.status.justNow;
    if (diff < 3_600_000) return copy.status.minutesAgo(Math.floor(diff / 60_000));
    if (diff < 86_400_000) return copy.status.hoursAgo(Math.floor(diff / 3_600_000));
    return value.toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US');
  };

  const saveStatus = isSaving
    ? copy.status.savingTitle
    : lastSavedAt
      ? `${copy.status.lastSavedPrefix} ${formatRelativeTime(lastSavedAt)}`
      : null;
  const assessmentTitle = draft.assessment.title.trim() || copy.defaults.untitledAssessment;
  const selectedQuestionMetrics = selectedQuestion ? getQuestionMetrics(selectedQuestion.id) : null;
  const isGenerating =
    regenerateQuestionMutation.isPending ||
    generationJob?.status === 'queued' ||
    generationJob?.status === 'running';
  const isGenerateDisabled =
    !selectedQuestion ||
    isSaving ||
    isDirty ||
    !selectedAssessmentId ||
    isStudentView ||
    isParsingInProgress;

  const hasPendingAction = Boolean(pendingAction);
  const showSavedBanner = Boolean(lastSavedAt && now - lastSavedAt.getTime() < 1_800);
  const showBanner = isDirty || isSaving || hasPendingAction || showSavedBanner;
  const bannerTone = isDirty || hasPendingAction ? 'warning' : isSaving ? 'neutral' : 'success';
  const bannerTitle = isSaving
    ? copy.status.savingTitle
    : isDirty || hasPendingAction
      ? copy.status.unsavedTitle
      : copy.status.savedTitle;
  const bannerMessage = isSaving
    ? copy.status.savingMessage
    : hasPendingAction
      ? pendingAction?.type === 'new'
        ? copy.status.pendingNew
        : copy.status.pendingSwitch
      : isDirty
        ? copy.status.unsavedMessage
        : (saveStatus ?? copy.status.allSaved);

  const questionTypeCounts = draft.questions.reduce<Record<Question['type'], number>>(
    (acc, question) => {
      acc[question.type] += 1;
      return acc;
    },
    { ...EMPTY_TYPE_COUNTS },
  );
  const totalPoints = draft.questions.reduce(
    (sum, question) => sum + (typeof question.points === 'number' ? question.points : 0),
    0,
  );
  const missingPointsCount = draft.questions.filter(
    (question) => typeof question.points !== 'number',
  ).length;
  const [isFetchLoaderVisible, setIsFetchLoaderVisible] = useState(false);
  const fetchLoaderShownAtRef = useRef<number | null>(null);
  const isFetchLoading = isLoading && !ready;
  const shouldHoldForUploadParsing =
    hasUploadParsingGate &&
    (!parsingStatus ||
      parsingStatus.status === 'not_started' ||
      parsingStatus.status === 'queued' ||
      parsingStatus.status === 'running');
  const showParsingStage = (ready && isParsingInProgress) || shouldHoldForUploadParsing;
  const showEditorContent = ready && !showParsingStage && !hasParsingFailed;
  const showFetchStage =
    (isFetchLoading || isFetchLoaderVisible) &&
    !showParsingStage &&
    !showEditorContent &&
    !hasParsingFailed;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!parsingAssessmentId) {
      const resetTimeout = window.setTimeout(() => {
        setHasUploadParsingGate(false);
      }, 0);

      return () => window.clearTimeout(resetTimeout);
    }

    const gateTimeout = window.setTimeout(() => {
      setHasUploadParsingGate(
        window.sessionStorage.getItem(getEditorUploadParsingGateKey(parsingAssessmentId)) === '1',
      );
    }, 0);

    return () => window.clearTimeout(gateTimeout);
  }, [parsingAssessmentId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!parsingAssessmentId || !hasUploadParsingGate || !parsingStatus) {
      return;
    }

    if (parsingStatus.status === 'queued' || parsingStatus.status === 'running') {
      return;
    }

    const clearTimeoutId = window.setTimeout(() => {
      window.sessionStorage.removeItem(getEditorUploadParsingGateKey(parsingAssessmentId));
      setHasUploadParsingGate(false);
    }, 0);

    return () => window.clearTimeout(clearTimeoutId);
  }, [hasUploadParsingGate, parsingAssessmentId, parsingStatus]);

  useEffect(() => {
    if (isFetchLoading) {
      if (fetchLoaderShownAtRef.current === null) {
        const showTimeout = window.setTimeout(() => {
          fetchLoaderShownAtRef.current = Date.now();
          setIsFetchLoaderVisible(true);
        }, 0);
        return () => window.clearTimeout(showTimeout);
      }

      if (!isFetchLoaderVisible) {
        const showTimeout = window.setTimeout(() => {
          setIsFetchLoaderVisible(true);
        }, 0);
        return () => window.clearTimeout(showTimeout);
      }

      return;
    }

    if (!isFetchLoaderVisible) {
      fetchLoaderShownAtRef.current = null;
      return;
    }

    const shownAt = fetchLoaderShownAtRef.current ?? Date.now();
    const remaining = Math.max(0, FETCH_LOADER_MIN_MS - (Date.now() - shownAt));
    const hideTimeout = window.setTimeout(() => {
      fetchLoaderShownAtRef.current = null;
      setIsFetchLoaderVisible(false);
    }, remaining);

    return () => window.clearTimeout(hideTimeout);
  }, [isFetchLoading, isFetchLoaderVisible]);

  useEffect(() => {
    if (!isFetchLoaderVisible) {
      return;
    }

    if (showParsingStage || showEditorContent || hasParsingFailed) {
      const hideTimeout = window.setTimeout(() => {
        fetchLoaderShownAtRef.current = null;
        setIsFetchLoaderVisible(false);
      }, 0);

      return () => window.clearTimeout(hideTimeout);
    }
  }, [hasParsingFailed, isFetchLoaderVisible, showEditorContent, showParsingStage]);

  const previewChoices = (question: DraftQuestion) => {
    const choices = question.choices ?? [];
    if (choices.length > 0) {
      return choices;
    }
    if (question.type === 'true_false') {
      return [copy.previewDefaults.trueLabel, copy.previewDefaults.falseLabel];
    }
    return [];
  };

  const questionTypeControl = (
    <Select
      value={selectedQuestion?.type ?? 'multiple_choice'}
      onValueChange={(value) => handleQuestionTypeChange(value as Question['type'])}
      disabled={!selectedQuestion || isParsingInProgress || isGenerating}
    >
      <SelectTrigger className="w-40 border-[#e1d6c8] bg-white/90">
        <SelectValue placeholder={copy.labels.questionType} />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {Object.entries(copy.questionTypeLabels).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  const handleSelectQuestion = (questionId: string) => {
    setSelectedQuestionId(questionId);
    setMobilePane('editor');
  };

  useEffect(() => {
    if (!selectedQuestionId) {
      const resetTimeout = window.setTimeout(() => {
        setMobilePane('questions');
      }, 0);

      return () => window.clearTimeout(resetTimeout);
    }
  }, [selectedQuestionId]);

  useEffect(() => {
    if (!isStudentView || !selectedQuestionId) {
      if (previewFocusTimeoutRef.current !== null) {
        window.clearTimeout(previewFocusTimeoutRef.current);
        previewFocusTimeoutRef.current = null;
      }

      const clearFocusTimeout = window.setTimeout(() => {
        setFocusedPreviewQuestionId(null);
      }, 0);

      return () => window.clearTimeout(clearFocusTimeout);
    }

    previewQuestionRefs.current[selectedQuestionId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });

    const setFocusTimeout = window.setTimeout(() => {
      setFocusedPreviewQuestionId(selectedQuestionId);
    }, 0);

    if (previewFocusTimeoutRef.current !== null) {
      window.clearTimeout(previewFocusTimeoutRef.current);
    }
    previewFocusTimeoutRef.current = window.setTimeout(() => {
      setFocusedPreviewQuestionId((current) => (current === selectedQuestionId ? null : current));
      previewFocusTimeoutRef.current = null;
    }, 850);

    return () => window.clearTimeout(setFocusTimeout);
  }, [isStudentView, selectedQuestionId]);

  const handleConfirmNext = async () => {
    if (!selectedQuestionId) return;
    await handleSaveDraft();

    const nextQuestion =
      findNextUnreviewedQuestion(draft.questions, selectedQuestionIndex) ??
      findNextQuestionByIndex(draft.questions, selectedQuestionIndex);
    if (!nextQuestion) return;
    if (nextQuestion.id === selectedQuestionId) {
      const currentStatus = selectedQuestion ? getQuestionReviewStatus(selectedQuestion) : null;
      if (currentStatus === 'reviewed') {
        return;
      }
    }
    handleSelectQuestion(nextQuestion.id);
  };

  const handleGenerateQuestion = async () => {
    if (!selectedQuestion) return;
    showActionError(null);
    showActionNotice(null);
    try {
      const response = await regenerateQuestionMutation.mutateAsync({
        questionId: selectedQuestion.id,
        targetCorrectRate: 60,
        mode: 'replace',
        style: 'rewrite',
      });
      setGenerationStyle('rewrite');
      setGenerationJobId(response.jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.errors.generic;
      showActionError(message);
    }
  };

  const handleGenerateSimilarQuestion = async () => {
    if (!selectedQuestion) return;
    showActionError(null);
    showActionNotice(null);
    const estimated = selectedQuestionMetrics?.estimatedCorrectRate;
    const targetCorrectRate =
      typeof estimated === 'number' && Number.isFinite(estimated)
        ? Math.min(100, Math.max(0, Math.round(estimated)))
        : 60;

    try {
      const response = await regenerateQuestionMutation.mutateAsync({
        questionId: selectedQuestion.id,
        targetCorrectRate,
        mode: 'replace',
        style: 'similar',
      });
      setGenerationStyle('similar');
      setGenerationJobId(response.jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.errors.generic;
      showActionError(message);
    }
  };

  useEffect(() => {
    if (!generationJob) return;
    if (generationJob.status !== 'failed') {
      handledFailedGenerationJobRef.current = null;
      return;
    }

    if (!generationJobId || handledFailedGenerationJobRef.current === generationJobId) {
      return;
    }

    if (generationJob.status === 'failed') {
      const message = generationJob.errorMessage ?? copy.errors.generic;
      showActionError(message);
      handledFailedGenerationJobRef.current = generationJobId;
    }
  }, [copy.errors, generationJob, generationJobId, showActionError]);

  useEffect(() => {
    if (!generationJob || generationJob.status !== 'success') return;
    const syncDraft = async () => {
      await queryClient.refetchQueries({
        queryKey: ['assessment-questions', selectedAssessmentId],
      });
      const data = queryClient.getQueryData<DraftQuestionsResponse>([
        'assessment-questions',
        selectedAssessmentId,
      ]);
      if (data?.questions) {
        handleReplaceQuestionsFromServer(data.questions);
      }

      showActionNotice(
        generationStyle === 'similar'
          ? copy.notices.similarQuestionGenerated
          : copy.notices.questionGenerated,
      );

      setGenerationStyle(null);
      setGenerationJobId(null);
    };

    syncDraft().catch((error) => {
      const message = error instanceof Error ? error.message : copy.errors.generic;
      showActionError(message);
    });
  }, [
    copy.errors,
    copy.notices.similarQuestionGenerated,
    copy.notices.questionGenerated,
    generationJob,
    generationStyle,
    handleReplaceQuestionsFromServer,
    queryClient,
    selectedAssessmentId,
    showActionError,
    showActionNotice,
  ]);

  useEffect(() => {
    if (!parsingAssessmentId || !parsingStatus) return;

    if (parsingStatus.status === 'queued' || parsingStatus.status === 'running') {
      parsingSyncKeyRef.current = null;
      return;
    }

    if (parsingStatus.status !== 'success') {
      return;
    }

    const syncKey = `${parsingAssessmentId}:${parsingStatus.updatedAt ?? 'no-updated-at'}`;
    if (parsingSyncKeyRef.current === syncKey) {
      return;
    }
    parsingSyncKeyRef.current = syncKey;

    const syncParsedQuestions = async () => {
      await queryClient.refetchQueries({
        queryKey: ['assessment', parsingAssessmentId],
      });
      await queryClient.refetchQueries({
        queryKey: ['assessment-questions', parsingAssessmentId],
      });
      const data = queryClient.getQueryData<DraftQuestionsResponse>([
        'assessment-questions',
        parsingAssessmentId,
      ]);
      if (data?.questions) {
        handleReplaceQuestionsFromServer(data.questions);
      }
    };

    syncParsedQuestions().catch((error) => {
      const message = error instanceof Error ? error.message : copy.errors.generic;
      showActionError(message);
    });
  }, [
    copy.errors.generic,
    handleReplaceQuestionsFromServer,
    parsingAssessmentId,
    parsingStatus,
    queryClient,
    showActionError,
  ]);

  const editorMainPane = isStudentView ? (
    <div className="rounded-2xl border border-[#e1d6c8] bg-[#fcfaf5] p-4 shadow-sm sm:p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#8b7a69]">
            {copy.labels.studentPreview}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#2b2621]">
            {draft.assessment.title || copy.defaults.untitledAssessment}
          </h2>
          {draft.assessment.description ? (
            <p className="mt-2 text-sm text-[#6b5c4d]">{draft.assessment.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAnswers((value) => !value)}
            aria-pressed={showAnswers}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
              showAnswers
                ? 'border-[#c86b3c] bg-[#c86b3c] text-white'
                : 'border-[#e1d6c8] bg-white text-[#6b5c4d] hover:border-[#c86b3c]/50 hover:text-[#2b2621]',
            )}
          >
            {copy.labels.showAnswers}
          </button>
          <button
            type="button"
            onClick={() => setShowPoints((value) => !value)}
            aria-pressed={showPoints}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
              showPoints
                ? 'border-[#c86b3c] bg-[#c86b3c] text-white'
                : 'border-[#e1d6c8] bg-white text-[#6b5c4d] hover:border-[#c86b3c]/50 hover:text-[#2b2621]',
            )}
          >
            {copy.labels.showPoints}
          </button>
        </div>
      </div>
      <div className="mt-6 space-y-4">
        {draft.questions.length === 0 ? (
          <p className="text-sm text-[#8b7a69]">{copy.empty.noQuestions}</p>
        ) : (
          draft.questions.map((question) => (
            <div
              key={question.id}
              ref={(element) => {
                previewQuestionRefs.current[question.id] = element;
              }}
              className={cn(
                'rounded-xl border border-[#e1d6c8] bg-white/90 p-4 shadow-sm transition-colors duration-300',
                question.id === selectedQuestionId
                  ? 'border-[#c86b3c]/60 bg-[#f7e1d2]/40'
                  : 'hover:border-[#c86b3c]/30',
                focusedPreviewQuestionId === question.id
                  ? 'ring-2 ring-[#c86b3c]/35 ring-offset-2 ring-offset-[#fcfaf5]'
                  : '',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm font-semibold text-[#2b2621]">
                  {copy.questionList.prefix}
                  {question.orderIndex}
                </div>
                {showPoints ? (
                  <span className="text-xs font-semibold text-[#6b5c4d]">
                    {copy.labels.points} {question.points ?? 0}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-[#2b2621]">
                <MathText text={question.prompt} fallback={copy.questionList.untitled} />
              </p>
              {['multiple_choice', 'true_false'].includes(question.type) ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {previewChoices(question).map((choice, index) => (
                    <div
                      key={`${question.id}-preview-choice-${index}`}
                      className="flex items-center gap-2 rounded-lg border border-[#e1d6c8] bg-white px-3 py-2 text-sm text-[#2b2621]"
                    >
                      <span className="text-xs font-semibold text-[#8b7a69]">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <MathText text={choice} />
                    </div>
                  ))}
                </div>
              ) : null}
              {question.type === 'short_answer' ? (
                <div className="mt-3 rounded-lg border border-dashed border-[#e1d6c8] bg-[#f7f1e6] px-3 py-4 text-xs text-[#8b7a69]">
                  {copy.previewDefaults.shortAnswerPlaceholder}
                </div>
              ) : null}
              {question.type === 'written' ? (
                <div className="mt-3 rounded-lg border border-dashed border-[#e1d6c8] bg-[#f7f1e6] px-3 py-4 text-xs text-[#8b7a69]">
                  {copy.previewDefaults.writtenPlaceholder}
                </div>
              ) : null}
              {showAnswers ? (
                <div className="mt-3 rounded-lg border border-[#f1d2c1] bg-[#f7e1d2]/50 px-3 py-2 text-xs text-[#2b2621]">
                  {question.type === 'true_false' ||
                  question.type === 'short_answer' ||
                  question.type === 'written' ? (
                    <>
                      <span className="font-semibold">{copy.labels.correctText}</span>{' '}
                      <MathText text={question.correctAnswer.text} fallback="-" />
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">{copy.labels.correctLabel}</span>{' '}
                      <MathText text={question.correctAnswer.label} fallback="-" />
                      <span className="ml-3 font-semibold">{copy.labels.correctText}</span>{' '}
                      <MathText text={question.correctAnswer.text} fallback="-" />
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  ) : (
    <QuestionEditorCard
      selectedQuestion={selectedQuestion}
      layout={layout}
      questionTypeControl={layout === 'studio' ? questionTypeControl : undefined}
      onPromptChange={handleQuestionPromptChange}
      onAddChoice={handleAddChoice}
      onChoiceChange={handleChoiceChange}
      onChoiceRemove={handleChoiceRemove}
      onCorrectAnswerChange={handleCorrectAnswerChange}
      onPointsChange={handlePointsChange}
      showAnswerFields={layout === 'studio'}
      showScoringFields={layout === 'studio'}
      metricsPanel={
        selectedQuestion ? (
          <QuestionMetricsPanel
            metrics={selectedQuestionMetrics}
            onGenerate={handleGenerateQuestion}
            onGenerateSimilar={handleGenerateSimilarQuestion}
            isGenerating={isGenerating}
            disabled={isGenerateDisabled}
            className="mt-2"
          />
        ) : null
      }
      onConfirmNext={handleConfirmNext}
      isSaving={isSaving}
      isReadOnly={isParsingInProgress}
      isGenerating={isGenerating}
      isDirty={isDirty || hasPendingAction}
      saveStatusLabel={saveStatus}
    />
  );

  const documentInspectorPane =
    isStudentView || layout !== 'document' ? null : (
      <QuestionInspectorPanel
        selectedQuestion={selectedQuestion}
        onQuestionTypeChange={handleQuestionTypeChange}
        onCorrectAnswerChange={handleCorrectAnswerChange}
        onPointsChange={handlePointsChange}
        isReadOnly={isParsingInProgress}
      />
    );

  const mobilePaneSwitcher = (
    <div className="flex items-center gap-2 rounded-xl border border-[#e1d6c8] bg-[#fcfaf5] p-1">
      <button
        type="button"
        onClick={() => setMobilePane('questions')}
        className={cn(
          'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition',
          mobilePane === 'questions'
            ? 'bg-[#2b2621] text-[#f6f1e8]'
            : 'text-[#6b5c4d] hover:text-[#2b2621]',
        )}
      >
        <span>{copy.labels.mobileQuestionsTab}</span>
        <span className="rounded-full border border-current/35 px-1.5 py-0.5 text-[10px] leading-none">
          {draft.questions.length}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setMobilePane('editor')}
        className={cn(
          'inline-flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition',
          mobilePane === 'editor'
            ? 'bg-[#2b2621] text-[#f6f1e8]'
            : 'text-[#6b5c4d] hover:text-[#2b2621]',
        )}
      >
        {copy.labels.mobileEditorTab}
      </button>
    </div>
  );

  return (
    <section className="w-full max-w-full min-w-0 overflow-x-hidden rounded-3xl border border-[#e1d6c8] bg-gradient-to-b from-[#f6f1e8] via-white to-[#fcfaf5] p-3 shadow-sm sm:p-4 md:p-6 xl:p-7">
      <div className="min-w-0 space-y-5 sm:space-y-6">
        <div className="space-y-2 border-b border-[#e1d6c8]/80 pb-3">
          <EditorHeader
            assessmentTitle={assessmentTitle}
            isSaving={isSaving}
            ready={ready}
            onSaveDraft={handleSaveDraft}
            layout={layout}
            onLayoutChange={setLayout}
            isStudentView={isStudentView}
            onToggleStudentView={() => setIsStudentView((current) => !current)}
            onOpenAssessmentSettings={() => setIsAssessmentDrawerOpen(true)}
            onOpenPrintEditor={() => {
              if (!assessment?.id) return;
              void navigate({
                to: '/print-editor/$assessmentId',
                params: { assessmentId: assessment.id },
              });
            }}
            canOpenPrintEditor={Boolean(assessment?.id)}
            isQuestionEditingLocked={isParsingInProgress || isGenerating}
            saveStatus={saveStatus}
            estimatedAverageCorrectRate={averageCorrectRate}
            questionTypeCounts={questionTypeCounts}
            totalPoints={totalPoints}
            missingPointsCount={missingPointsCount}
          />
        </div>

        {hasParsingFailed ? (
          <Card className="border border-dashed border-rose-200 bg-white">
            <CardHeader>
              <CardTitle className="text-rose-700">{copy.status.parsingFailedTitle}</CardTitle>
              <CardDescription className="text-[#6b5c4d]">
                {parsingStatus?.errorMessage ?? copy.status.parsingFailedBody}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!parsingAssessmentId) return;
                  void navigate({
                    to: '/',
                    search: { assessmentId: parsingAssessmentId },
                  });
                }}
                className="border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c]"
              >
                {copy.status.parsingFailedAction}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {actionError ? (
          <Card className="border border-dashed border-red-200 bg-white">
            <CardHeader>
              <CardTitle className="text-red-700">{copy.errors.actionFailedTitle}</CardTitle>
              <CardDescription className="text-[#6b5c4d]">{actionError}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {showBanner || actionNotice ? (
          <div className="fixed inset-x-3 bottom-3 z-50 flex flex-col gap-2 md:inset-x-auto md:bottom-auto md:right-6 md:top-20 md:w-80">
            {showBanner ? (
              <div
                className={
                  bannerTone === 'warning'
                    ? 'rounded-2xl border border-amber-200/70 bg-amber-50/90 px-4 py-2 text-xs text-amber-900 shadow-lg'
                    : bannerTone === 'success'
                      ? 'rounded-2xl border border-emerald-200/70 bg-emerald-50/90 px-4 py-2 text-xs text-emerald-900 shadow-lg'
                      : 'rounded-2xl border border-[#e1d6c8]/70 bg-white/95 px-4 py-2 text-xs text-[#4b433b] shadow-lg'
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{bannerTitle}</p>
                    <p className="text-xs opacity-80">{bannerMessage}</p>
                  </div>
                  {isDirty || hasPendingAction ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveDraft}
                        disabled={isSaving}
                        className="bg-[#c86b3c] text-white hover:bg-[#b45d33]"
                      >
                        {copy.actions.save}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDiscardChanges}
                        disabled={isSaving}
                        className="border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c]"
                      >
                        {copy.actions.discard}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {!showBanner && actionNotice ? (
              <div className="w-64 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-xs text-emerald-700 shadow-lg">
                <p className="font-semibold">{actionNotice}</p>
                <p className="mt-1 text-emerald-600">{copy.notices.draftStored}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {showFetchStage ? (
          <Card className="border border-dashed border-[#e1d6c8] bg-white/95">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[#2b2621]">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-[#c86b3c]/30 border-t-[#c86b3c]"
                />
                {copy.status.preparingEditorTitle}
              </CardTitle>
              <CardDescription className="text-[#6b5c4d]">
                {copy.status.preparingEditorBody}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)_280px]">
                <div className="space-y-2 rounded-2xl border border-[#eee4d8] bg-[#fcfaf5] p-3">
                  <div className="h-3 w-20 animate-pulse rounded bg-[#e8ded1]" />
                  <div className="h-9 animate-pulse rounded-lg bg-[#f0e7db]" />
                  <div className="h-9 animate-pulse rounded-lg bg-[#f0e7db]" />
                  <div className="h-9 animate-pulse rounded-lg bg-[#f0e7db]" />
                </div>
                <div className="space-y-3 rounded-2xl border border-[#eee4d8] bg-white p-4">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-[#e8ded1]" />
                  <div className="h-4 w-11/12 animate-pulse rounded bg-[#f0e7db]" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-[#f0e7db]" />
                  <div className="h-24 animate-pulse rounded-xl bg-[#f6efe5]" />
                </div>
                <div className="space-y-3 rounded-2xl border border-[#eee4d8] bg-[#fcfaf5] p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[#e8ded1]" />
                  <div className="h-10 animate-pulse rounded-lg bg-[#f0e7db]" />
                  <div className="h-10 animate-pulse rounded-lg bg-[#f0e7db]" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {showParsingStage && !showFetchStage ? (
          <Card className="border border-[#e7c1a9] bg-[#fcf4ec]/80">
            <CardHeader>
              <CardTitle className="text-[#8f3f1d]">{copy.status.parsingInProgressTitle}</CardTitle>
              <CardDescription className="text-[#6b5c4d]">
                {copy.status.parsingInProgressBody}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)_280px]">
                <div className="space-y-2 rounded-2xl border border-[#eadbca] bg-white/70 p-3">
                  <div className="h-3 w-24 animate-pulse rounded bg-[#ead8c5]" />
                  <div className="h-9 animate-pulse rounded-lg bg-[#f3e6d8]" />
                  <div className="h-9 animate-pulse rounded-lg bg-[#f3e6d8]" />
                  <div className="h-9 animate-pulse rounded-lg bg-[#f3e6d8]" />
                </div>
                <div className="space-y-3 rounded-2xl border border-[#eadbca] bg-white p-4">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-[#ead8c5]" />
                  <div className="h-4 w-11/12 animate-pulse rounded bg-[#f3e6d8]" />
                  <div className="h-4 w-4/5 animate-pulse rounded bg-[#f3e6d8]" />
                  <div className="h-24 animate-pulse rounded-xl bg-[#f9f0e5]" />
                </div>
                <div className="space-y-3 rounded-2xl border border-[#eadbca] bg-white/70 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[#ead8c5]" />
                  <div className="h-10 animate-pulse rounded-lg bg-[#f3e6d8]" />
                  <div className="h-10 animate-pulse rounded-lg bg-[#f3e6d8]" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!showEditorContent || showFetchStage || showParsingStage ? null : (
          <>
            <div className="space-y-3 md:hidden">
              {mobilePaneSwitcher}

              {mobilePane === 'questions' ? (
                <QuestionListPanel
                  questions={draft.questions}
                  selectedQuestionId={selectedQuestionId}
                  onSelectQuestion={handleSelectQuestion}
                  onAddQuestion={handleAddQuestion}
                  onMoveQuestion={handleMoveQuestion}
                  onReorderQuestion={handleReorderQuestion}
                  onDeleteQuestion={handleDeleteQuestion}
                  isSaving={isSaving}
                  isReadOnly={isStudentView || isParsingInProgress}
                  getQuestionMetrics={getQuestionMetrics}
                />
              ) : (
                <div className="space-y-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMobilePane('questions')}
                    className="w-full border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c]"
                  >
                    {copy.actions.backToQuestions}
                  </Button>
                  <div className="min-w-0 space-y-5 sm:space-y-6">{editorMainPane}</div>
                  {documentInspectorPane}
                </div>
              )}
            </div>

            <div
              className={cn(
                'hidden min-w-0 gap-4 sm:gap-5 md:grid md:gap-6',
                isStudentView || layout !== 'document'
                  ? 'md:grid-cols-[260px_minmax(0,1fr)]'
                  : 'md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]',
              )}
            >
              <QuestionListPanel
                questions={draft.questions}
                selectedQuestionId={selectedQuestionId}
                onSelectQuestion={handleSelectQuestion}
                onAddQuestion={handleAddQuestion}
                onMoveQuestion={handleMoveQuestion}
                onReorderQuestion={handleReorderQuestion}
                onDeleteQuestion={handleDeleteQuestion}
                isSaving={isSaving}
                isReadOnly={isStudentView || isParsingInProgress}
                getQuestionMetrics={getQuestionMetrics}
                className="self-start md:sticky md:top-4 md:h-[calc(100vh-10rem)] md:min-h-[420px]"
              />
              <div className="min-w-0 space-y-5 sm:space-y-6">{editorMainPane}</div>
              {documentInspectorPane}
            </div>
          </>
        )}
      </div>
      {isAssessmentDrawerOpen ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/20"
            role="button"
            tabIndex={0}
            onClick={() => setIsAssessmentDrawerOpen(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setIsAssessmentDrawerOpen(false);
              }
            }}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-lg border-l border-[#e1d6c8] bg-[#fcfaf5] p-4 shadow-xl sm:p-5 md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#8b7a69]">
                  {copy.header.assessmentSettingsLabel}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[#2b2621]">
                  {draft.assessment.title || copy.defaults.untitledAssessment}
                </h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAssessmentDrawerOpen(false)}
                className="border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c]"
              >
                {copy.actions.close}
              </Button>
            </div>
            <div className="mt-6">
              <AssessmentDetailsCard
                assessment={draft.assessment}
                onAssessmentChange={handleAssessmentChange}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
