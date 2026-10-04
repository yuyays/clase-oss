import { useEffect, useMemo } from 'react';

import { useLocalStorage } from '@/lib/use-local-storage';

export type QuestionMetrics = {
  estimatedCorrectRate: number;
  targetRate: number;
};

type QuestionRef = { id: string };

const DEFAULT_TARGET_RATE = 60;
const MIN_ESTIMATE = 35;
const MAX_ESTIMATE = 85;

const clampRate = (value: number) => Math.max(0, Math.min(100, value));

const createRandomEstimate = () =>
  Math.floor(Math.random() * (MAX_ESTIMATE - MIN_ESTIMATE + 1)) + MIN_ESTIMATE;

const METRICS_STORAGE_KEY = 'editor-question-metrics';
const getAssessmentKey = (assessmentId: string | null) => assessmentId ?? 'new';

const buildDefaultMetrics = (existing?: QuestionMetrics): QuestionMetrics => ({
  estimatedCorrectRate: createRandomEstimate(),
  targetRate: existing?.targetRate ?? DEFAULT_TARGET_RATE,
});

export const useQuestionMetrics = (assessmentId: string | null, questions: QuestionRef[]) => {
  const assessmentKey = getAssessmentKey(assessmentId);
  const [allMetrics, setAllMetrics] = useLocalStorage<
    Record<string, Record<string, QuestionMetrics>>
  >(METRICS_STORAGE_KEY, {});
  const metrics = useMemo(() => allMetrics[assessmentKey] ?? {}, [allMetrics, assessmentKey]);

  useEffect(() => {
    if (!questions.length) return;
    const missing = questions.filter((question) => !metrics[question.id]);
    if (missing.length === 0) return;

    setAllMetrics((current) => {
      const next = { ...current };
      const nextAssessment = { ...(next[assessmentKey] ?? {}) };
      missing.forEach((question) => {
        if (!nextAssessment[question.id]) {
          nextAssessment[question.id] = buildDefaultMetrics();
        }
      });
      next[assessmentKey] = nextAssessment;
      return next;
    });
  }, [assessmentKey, metrics, questions, setAllMetrics]);

  const getQuestionMetrics = (questionId: string) => metrics[questionId] ?? null;

  const setEstimatedCorrectRate = (questionId: string, value: number) => {
    setAllMetrics((current) => {
      const next = { ...current };
      const existing = next[assessmentKey]?.[questionId];
      const nextValue = clampRate(value);
      const nextAssessment = {
        ...(next[assessmentKey] ?? {}),
        [questionId]: {
          ...buildDefaultMetrics(existing),
          estimatedCorrectRate: nextValue,
        },
      };
      return {
        ...next,
        [assessmentKey]: nextAssessment,
      };
    });
  };

  const adjustEstimatedCorrectRate = (questionId: string, delta: number) => {
    setAllMetrics((current) => {
      const next = { ...current };
      const existing = next[assessmentKey]?.[questionId];
      const currentValue = existing?.estimatedCorrectRate ?? createRandomEstimate();
      const nextAssessment = {
        ...(next[assessmentKey] ?? {}),
        [questionId]: {
          ...buildDefaultMetrics(existing),
          estimatedCorrectRate: clampRate(currentValue + delta),
        },
      };
      return {
        ...next,
        [assessmentKey]: nextAssessment,
      };
    });
  };

  const setEstimatedToTarget = (questionId: string) => {
    setAllMetrics((current) => {
      const next = { ...current };
      const existing = next[assessmentKey]?.[questionId];
      const targetRate = existing?.targetRate ?? DEFAULT_TARGET_RATE;
      const nextAssessment = {
        ...(next[assessmentKey] ?? {}),
        [questionId]: {
          ...buildDefaultMetrics(existing),
          targetRate,
          estimatedCorrectRate: targetRate,
        },
      };
      return {
        ...next,
        [assessmentKey]: nextAssessment,
      };
    });
  };

  const regenerateAllEstimates = () => {
    if (!questions.length) return;
    setAllMetrics((current) => {
      const next = { ...current };
      const nextAssessment = { ...(next[assessmentKey] ?? {}) };
      questions.forEach((question) => {
        nextAssessment[question.id] = buildDefaultMetrics(nextAssessment[question.id]);
      });
      next[assessmentKey] = nextAssessment;
      return next;
    });
  };

  const averageCorrectRate = useMemo(() => {
    if (!questions.length) return null;
    const values = questions
      .map((question) => metrics[question.id]?.estimatedCorrectRate)
      .filter((value): value is number => typeof value === 'number');
    if (values.length === 0) return null;
    const total = values.reduce((sum, value) => sum + value, 0);
    return Math.round(total / values.length);
  }, [metrics, questions]);

  return {
    metrics,
    getQuestionMetrics,
    setEstimatedCorrectRate,
    adjustEstimatedCorrectRate,
    setEstimatedToTarget,
    regenerateAllEstimates,
    averageCorrectRate,
  };
};
