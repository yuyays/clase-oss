import { useEffect, useMemo, useRef, useState } from 'react';

import {
  type Assessment,
  type AssessmentCategory,
  type AssessmentPayload,
  type Question,
  useCreateAssessment,
  useCreateDraftVersion,
  useReplaceDraftQuestions,
  useUpdateAssessment,
} from '@/lib/assessment-api';
import { NEW_ASSESSMENT_ID } from '@/ui/editor/editor-constants';
import { useEditorCopy } from '@/ui/editor/use-editor-copy';

export type AssessmentDraft = {
  title: string;
  description: string | null;
  assessmentCategory: AssessmentCategory;
  customCategoryLabel: string | null;
  subject: string | null;
  grade: string | null;
};

export type DraftQuestion = Omit<
  Question,
  'choices' | 'correctAnswer' | 'id' | 'assessmentVersionId'
> & {
  id: string;
  choices: string[];
  correctAnswer: { label: string; text: string };
};

export type DraftState = {
  assessment: AssessmentDraft;
  questions: DraftQuestion[];
};

type UseEditorDraftParams = {
  assessments: Assessment[];
  assessment: Assessment | null;
  questions: Question[];
  assessmentVersionId: string | null;
  selectedAssessmentId: string | null;
  isQuestionEditingLocked?: boolean;
  onSelectAssessment: (assessmentId: string) => void;
};

type PendingAction =
  | {
      type: 'select';
      assessmentId: string;
    }
  | {
      type: 'new';
    };

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
};

const toOptional = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseOptionalInteger = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const reindexQuestions = (questions: DraftQuestion[]) =>
  questions.map((question, index) => ({ ...question, orderIndex: index + 1 }));

const createBlankAssessment = (defaultTitle: string): AssessmentDraft => ({
  title: defaultTitle,
  description: null,
  assessmentCategory: null,
  customCategoryLabel: null,
  subject: null,
  grade: null,
});

const createBlankQuestion = (orderIndex: number): DraftQuestion => ({
  id: createId(),
  type: 'multiple_choice',
  prompt: '',
  choices: [''],
  correctAnswer: { label: '', text: '' },
  points: null,
  orderIndex,
});

const createBlankDraft = (defaultTitle: string) => createDraftFromApi(null, null, defaultTitle);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildDuplicateTitle = (baseTitle: string, existingTitles: string[], copyLabel: string) => {
  const normalizedBase = baseTitle.trim();
  const baseRoot = normalizedBase.replace(/\s+\((?:Copy|コピー)\s+\d+\)$/i, '');
  const copyRegex = new RegExp(`^${escapeRegExp(baseRoot)} \\((?:Copy|コピー) (\\d+)\\)$`, 'i');
  let maxCopy = 0;

  for (const title of existingTitles) {
    const match = title.match(copyRegex);
    if (match) {
      const value = Number(match[1]);
      if (!Number.isNaN(value)) {
        maxCopy = Math.max(maxCopy, value);
      }
    }
  }

  return `${baseRoot} (${copyLabel} ${maxCopy + 1})`;
};

const createDraftFromApi = (
  assessment?: Assessment | null,
  questions?: Question[] | null,
  defaultTitle = 'Untitled assessment',
): DraftState => {
  const safeAssessment = assessment ?? createBlankAssessment(defaultTitle);
  const list = questions ?? [];
  const normalized = [...list].sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    assessment: {
      title: safeAssessment.title || defaultTitle,
      description: safeAssessment.description ?? null,
      assessmentCategory: safeAssessment.assessmentCategory ?? null,
      customCategoryLabel: safeAssessment.customCategoryLabel ?? null,
      subject: safeAssessment.subject ?? null,
      grade: safeAssessment.grade ?? null,
    },
    questions: normalized.map((question, index) => ({
      id: question.id ?? createId(),
      type: question.type,
      prompt: question.prompt ?? '',
      choices: Array.isArray(question.choices) ? question.choices : [],
      correctAnswer: {
        label: question.correctAnswer?.label ?? '',
        text: question.correctAnswer?.text ?? '',
      },
      points: question.points ?? null,
      orderIndex: question.orderIndex ?? index + 1,
    })),
  };
};

const parseDraftSnapshot = (snapshot: string, fallback: DraftState) => {
  try {
    const parsed = JSON.parse(snapshot) as DraftState;
    if (parsed && typeof parsed === 'object' && 'assessment' in parsed && 'questions' in parsed) {
      return parsed;
    }
  } catch {
    return fallback;
  }
  return fallback;
};

const buildAssessmentPayload = (
  assessment: AssessmentDraft,
  defaultTitle: string,
): AssessmentPayload => ({
  title: assessment.title.trim() || defaultTitle,
  description: assessment.description ?? null,
  assessmentCategory: assessment.assessmentCategory ?? null,
  customCategoryLabel: assessment.customCategoryLabel ?? null,
  subject: assessment.subject ?? null,
  grade: assessment.grade ?? null,
});

const buildQuestionsPayload = (draft: DraftState): Question[] =>
  draft.questions.map((question) => {
    const cleanedChoices = question.choices.map((choice) => choice.trim()).filter(Boolean);
    const useChoices = question.type === 'multiple_choice' || question.type === 'true_false';

    return {
      type: question.type,
      prompt: question.prompt.trim(),
      choices: useChoices ? cleanedChoices : null,
      correctAnswer: {
        label: toOptional(question.correctAnswer.label) ?? null,
        text: toOptional(question.correctAnswer.text) ?? null,
      },
      points: question.points ?? null,
      orderIndex: question.orderIndex,
    };
  });

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }
  return fallback;
};

export const useEditorDraft = ({
  assessments,
  assessment,
  questions,
  assessmentVersionId,
  selectedAssessmentId,
  isQuestionEditingLocked = false,
  onSelectAssessment,
}: UseEditorDraftParams) => {
  const copy = useEditorCopy();
  const defaultTitle = copy.defaults.untitledAssessment;
  const serverDraft = useMemo(
    () => createDraftFromApi(assessment, questions, defaultTitle),
    [assessment, questions, defaultTitle],
  );
  const initialDraft = serverDraft;
  const [draft, setDraft] = useState<DraftState>(() => serverDraft);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    initialDraft.questions[0]?.id ?? null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [baselineSnapshot, setBaselineSnapshot] = useState(() => JSON.stringify(initialDraft));
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== baselineSnapshot,
    [baselineSnapshot, draft],
  );

  const createAssessmentMutation = useCreateAssessment();
  const updateAssessmentMutation = useUpdateAssessment();
  const createDraftVersionMutation = useCreateDraftVersion();
  const replaceDraftQuestionsMutation = useReplaceDraftQuestions();

  const selectedQuestion =
    draft.questions.find((question) => question.id === selectedQuestionId) ?? null;
  const selectedQuestionIndex = selectedQuestion
    ? draft.questions.findIndex((question) => question.id === selectedQuestion.id)
    : -1;
  const isNewAssessment = !selectedAssessmentId || selectedAssessmentId === NEW_ASSESSMENT_ID;
  const canDuplicate = Boolean(selectedAssessmentId && selectedAssessmentId !== NEW_ASSESSMENT_ID);
  const previousServerAssessmentIdRef = useRef<string | null>(assessment?.id ?? null);

  useEffect(() => {
    const currentServerAssessmentId = assessment?.id ?? null;
    const previousServerAssessmentId = previousServerAssessmentIdRef.current;
    const serverSnapshot = JSON.stringify(serverDraft);

    if (previousServerAssessmentId !== currentServerAssessmentId) {
      previousServerAssessmentIdRef.current = currentServerAssessmentId;
      const syncTimeout = window.setTimeout(() => {
        setDraft(serverDraft);
        setBaselineSnapshot(serverSnapshot);
        setSelectedQuestionId(serverDraft.questions[0]?.id ?? null);
        setPendingAction(null);
        setActionError(null);
      }, 0);

      return () => window.clearTimeout(syncTimeout);
    }

    if (isDirty || baselineSnapshot === serverSnapshot) {
      return;
    }

    const syncTimeout = window.setTimeout(() => {
      setDraft(serverDraft);
      setBaselineSnapshot(serverSnapshot);
      setSelectedQuestionId((current) => {
        const nextSelectedId = serverDraft.questions.find(
          (question) => question.id === current,
        )?.id;
        return nextSelectedId ?? serverDraft.questions[0]?.id ?? null;
      });
    }, 0);

    return () => window.clearTimeout(syncTimeout);
  }, [assessment?.id, baselineSnapshot, isDirty, serverDraft]);

  const handleAssessmentChange = (
    field: keyof DraftState['assessment'],
    value: DraftState['assessment'][keyof DraftState['assessment']],
  ) => {
    setActionNotice(null);
    setDraft((current) => ({
      ...current,
      assessment: {
        ...current.assessment,
        [field]: value,
      },
    }));
  };

  const updateQuestion = (id: string, updater: (question: DraftQuestion) => DraftQuestion) => {
    setActionNotice(null);
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === id ? updater(question) : question,
      ),
    }));
  };

  const startNewDraft = () => {
    const blankDraft = createBlankDraft(defaultTitle);
    setDraft(blankDraft);
    setSelectedQuestionId(blankDraft.questions[0]?.id ?? null);
    setBaselineSnapshot(JSON.stringify(blankDraft));
    onSelectAssessment(NEW_ASSESSMENT_ID);
  };

  const resolvePendingAction = (action: PendingAction) => {
    setPendingAction(null);
    if (action.type === 'new') {
      startNewDraft();
      return;
    }
    if (action.assessmentId === NEW_ASSESSMENT_ID) {
      startNewDraft();
      return;
    }
    onSelectAssessment(action.assessmentId);
  };

  const handleSelectAssessment = (assessmentId: string) => {
    setActionNotice(null);
    setActionError(null);
    if (isDirty) {
      setPendingAction({ type: 'select', assessmentId });
      return;
    }
    if (assessmentId === NEW_ASSESSMENT_ID) {
      startNewDraft();
      return;
    }
    onSelectAssessment(assessmentId);
  };

  const handleNewAssessment = () => {
    setActionNotice(null);
    setActionError(null);
    if (isDirty) {
      setPendingAction({ type: 'new' });
      return;
    }
    startNewDraft();
  };

  const handleDiscardChanges = () => {
    const baseline = parseDraftSnapshot(baselineSnapshot, initialDraft);
    setActionNotice(null);
    setActionError(null);
    setDraft(baseline);
    setSelectedQuestionId(baseline.questions[0]?.id ?? null);
    if (pendingAction) {
      resolvePendingAction(pendingAction);
    }
  };

  const handleAddQuestion = () => {
    if (isQuestionEditingLocked) return;
    setActionNotice(null);
    const nextQuestion = createBlankQuestion(draft.questions.length + 1);
    setDraft((current) => ({
      ...current,
      questions: [...current.questions, nextQuestion],
    }));
    setSelectedQuestionId(nextQuestion.id);
  };

  const handleDeleteQuestion = () => {
    if (isQuestionEditingLocked) return;
    if (!selectedQuestion) return;
    setActionNotice(null);
    const nextQuestions = reindexQuestions(
      draft.questions.filter((question) => question.id !== selectedQuestion.id),
    );
    setDraft((current) => ({
      ...current,
      questions: nextQuestions,
    }));
    setSelectedQuestionId(nextQuestions[0]?.id ?? null);
  };

  const handleMoveQuestion = (direction: 'up' | 'down', questionId?: string) => {
    if (isQuestionEditingLocked) return;
    const targetQuestionId = questionId ?? selectedQuestion?.id;
    if (!targetQuestionId) return;
    setActionNotice(null);
    const currentIndex = draft.questions.findIndex((question) => question.id === targetQuestionId);
    if (currentIndex === -1) return;
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= draft.questions.length) return;
    const nextQuestions = [...draft.questions];
    const currentQuestion = nextQuestions[currentIndex];
    const nextQuestion = nextQuestions[nextIndex];
    if (!currentQuestion || !nextQuestion) return;
    nextQuestions[currentIndex] = nextQuestion;
    nextQuestions[nextIndex] = currentQuestion;
    const reindexed = reindexQuestions(nextQuestions);
    setDraft((current) => ({
      ...current,
      questions: reindexed,
    }));
    setSelectedQuestionId(reindexed[nextIndex]?.id ?? targetQuestionId);
  };

  const handleReorderQuestion = (questionId: string, targetIndex: number) => {
    if (isQuestionEditingLocked) return;
    setActionNotice(null);
    const currentIndex = draft.questions.findIndex((question) => question.id === questionId);
    if (currentIndex === -1) return;
    const boundedTarget = Math.max(0, Math.min(targetIndex, draft.questions.length - 1));
    if (boundedTarget === currentIndex) return;

    const nextQuestions = [...draft.questions];
    const [moved] = nextQuestions.splice(currentIndex, 1);
    if (!moved) return;
    nextQuestions.splice(boundedTarget, 0, moved);

    const reindexed = reindexQuestions(nextQuestions);
    setDraft((current) => ({
      ...current,
      questions: reindexed,
    }));
    setSelectedQuestionId(questionId);
    setActionNotice(copy.notices.reordered);
  };

  const handleQuestionTypeChange = (value: DraftQuestion['type']) => {
    if (isQuestionEditingLocked) return;
    if (!selectedQuestion) return;
    updateQuestion(selectedQuestion.id, (question) => {
      const nextChoices =
        value === 'true_false'
          ? [copy.previewDefaults.trueLabel, copy.previewDefaults.falseLabel]
          : value === 'multiple_choice'
            ? question.choices.length
              ? question.choices
              : ['']
            : [];
      const shouldClearLabel =
        value === 'true_false' || value === 'short_answer' || value === 'written';
      return {
        ...question,
        type: value,
        choices: nextChoices,
        correctAnswer: shouldClearLabel
          ? { ...question.correctAnswer, label: '' }
          : question.correctAnswer,
      };
    });
  };

  const handleQuestionPromptChange = (value: string) => {
    if (isQuestionEditingLocked) return;
    if (!selectedQuestion) return;
    updateQuestion(selectedQuestion.id, (question) => ({
      ...question,
      prompt: value,
    }));
  };

  const handleAddChoice = () => {
    if (isQuestionEditingLocked) return;
    if (!selectedQuestion) return;
    updateQuestion(selectedQuestion.id, (question) => ({
      ...question,
      choices: [...question.choices, ''],
    }));
  };

  const handleChoiceChange = (index: number, value: string) => {
    if (isQuestionEditingLocked) return;
    if (!selectedQuestion) return;
    updateQuestion(selectedQuestion.id, (question) => {
      const nextChoices = [...question.choices];
      nextChoices[index] = value;
      return { ...question, choices: nextChoices };
    });
  };

  const handleChoiceRemove = (index: number) => {
    if (isQuestionEditingLocked) return;
    if (!selectedQuestion) return;
    updateQuestion(selectedQuestion.id, (question) => {
      const nextChoices = question.choices.filter((_, choiceIndex) => choiceIndex !== index);
      return { ...question, choices: nextChoices };
    });
  };

  const handleCorrectAnswerChange = (field: 'label' | 'text', value: string) => {
    if (isQuestionEditingLocked) return;
    if (!selectedQuestion) return;
    updateQuestion(selectedQuestion.id, (question) => ({
      ...question,
      correctAnswer: {
        ...question.correctAnswer,
        [field]: value,
      },
    }));
  };

  const handlePointsChange = (value: string) => {
    if (isQuestionEditingLocked) return;
    if (!selectedQuestion) return;
    updateQuestion(selectedQuestion.id, (question) => ({
      ...question,
      points: parseOptionalInteger(value),
    }));
  };

  const handleDuplicateAssessment = async () => {
    setActionError(null);
    setActionNotice(null);

    try {
      const existingTitles = assessments.map((item) => item.title);
      const duplicateTitle = buildDuplicateTitle(
        draft.assessment.title || defaultTitle,
        existingTitles,
        copy.defaults.copyLabel,
      );
      const draftWithTitle = {
        ...draft,
        assessment: {
          ...draft.assessment,
          title: duplicateTitle,
        },
      };
      setDraft(draftWithTitle);

      const created = await createAssessmentMutation.mutateAsync(
        buildAssessmentPayload(draftWithTitle.assessment, defaultTitle),
      );
      const version = await createDraftVersionMutation.mutateAsync({
        assessmentId: created.id,
      });
      await replaceDraftQuestionsMutation.mutateAsync({
        assessmentVersionId: version.id,
        questions: buildQuestionsPayload(draftWithTitle),
      });
      onSelectAssessment(created.id);
      setActionNotice(copy.notices.duplicated);
      setBaselineSnapshot(JSON.stringify(draftWithTitle));
      setLastSavedAt(new Date());
    } catch (error) {
      setActionError(getErrorMessage(error, copy.errors.generic));
    }
  };

  const handleSaveDraft = async () => {
    if (isQuestionEditingLocked) {
      setActionError(copy.status.parsingLockedSaveError);
      return;
    }

    setActionError(null);
    setActionNotice(null);
    const pending = pendingAction;

    try {
      if (isNewAssessment) {
        const created = await createAssessmentMutation.mutateAsync(
          buildAssessmentPayload(draft.assessment, defaultTitle),
        );
        const version = await createDraftVersionMutation.mutateAsync({
          assessmentId: created.id,
        });
        await replaceDraftQuestionsMutation.mutateAsync({
          assessmentVersionId: version.id,
          questions: buildQuestionsPayload(draft),
        });
        if (!pending) {
          onSelectAssessment(created.id);
        }
        setBaselineSnapshot(JSON.stringify(draft));
        setLastSavedAt(new Date());
        if (pending) {
          resolvePendingAction(pending);
        }
        return;
      }

      await updateAssessmentMutation.mutateAsync({
        assessmentId: selectedAssessmentId,
        payload: buildAssessmentPayload(draft.assessment, defaultTitle),
      });

      let draftVersionId = assessmentVersionId;
      if (!draftVersionId) {
        const version = await createDraftVersionMutation.mutateAsync({
          assessmentId: selectedAssessmentId,
        });
        draftVersionId = version.id;
      }

      await replaceDraftQuestionsMutation.mutateAsync({
        assessmentVersionId: draftVersionId,
        questions: buildQuestionsPayload(draft),
      });
      setBaselineSnapshot(JSON.stringify(draft));
      setLastSavedAt(new Date());
      if (pending) {
        resolvePendingAction(pending);
      }
    } catch (error) {
      setActionError(getErrorMessage(error, copy.errors.generic));
    }
  };

  const isSaving =
    createAssessmentMutation.isPending ||
    updateAssessmentMutation.isPending ||
    createDraftVersionMutation.isPending ||
    replaceDraftQuestionsMutation.isPending;

  const showActionNotice = (message: string | null) => {
    setActionNotice(message);
  };

  const showActionError = (message: string | null) => {
    setActionError(message);
  };

  const handleReplaceQuestionsFromServer = (nextQuestions: Question[]) => {
    const normalized = createDraftFromApi(assessment, nextQuestions, defaultTitle).questions;
    setDraft((current) => {
      const nextDraft = { ...current, questions: normalized };
      setBaselineSnapshot(JSON.stringify(nextDraft));
      return nextDraft;
    });
    const nextSelectedId = normalized.find((question) => question.id === selectedQuestionId)?.id;
    setSelectedQuestionId(nextSelectedId ?? normalized[0]?.id ?? null);
  };

  return {
    draft,
    selectedQuestion,
    selectedQuestionId,
    selectedQuestionIndex,
    actionError,
    actionNotice,
    isDirty,
    isSaving,
    isNewAssessment,
    canDuplicate,
    pendingAction,
    lastSavedAt,
    setSelectedQuestionId,
    handleAssessmentChange,
    handleSelectAssessment,
    handleNewAssessment,
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
    handleDuplicateAssessment,
    handleSaveDraft,
    handleReplaceQuestionsFromServer,
    showActionNotice,
    showActionError,
  };
};
