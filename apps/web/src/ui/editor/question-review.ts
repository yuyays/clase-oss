import type { DraftQuestion } from '@/lib/use-editor-draft';

export type QuestionReviewStatus = 'reviewed' | 'needs-review' | 'untouched';

export const getQuestionReviewStatus = (question: DraftQuestion): QuestionReviewStatus => {
  const prompt = question.prompt.trim();
  const hasPrompt = prompt.length > 0;
  const hasCorrectLabel = question.correctAnswer.label.trim().length > 0;
  const hasCorrectText = question.correctAnswer.text.trim().length > 0;
  const hasCorrectAnswer = hasCorrectLabel || hasCorrectText;
  const usesChoices = ['multiple_choice', 'true_false'].includes(question.type);
  const hasChoice = usesChoices
    ? question.choices.some((choice) => choice.trim().length > 0)
    : false;
  const hasPoints = question.points !== null;
  const isReviewed = hasPrompt && hasCorrectAnswer && (!usesChoices || hasChoice);
  const isTouched = hasPrompt || hasCorrectAnswer || hasChoice || hasPoints;

  if (!isTouched) return 'untouched';
  return isReviewed ? 'reviewed' : 'needs-review';
};

export const findNextUnreviewedQuestion = (
  questions: DraftQuestion[],
  startIndex: number,
): DraftQuestion | null => {
  if (questions.length === 0) return null;
  const total = questions.length;
  const start = Math.max(0, startIndex + 1);

  for (let offset = 0; offset < total; offset += 1) {
    const index = (start + offset) % total;
    const question = questions[index];
    if (question && getQuestionReviewStatus(question) !== 'reviewed') {
      return question;
    }
  }

  return null;
};

export const findNextQuestionByIndex = (
  questions: DraftQuestion[],
  startIndex: number,
): DraftQuestion | null => {
  const nextIndex = startIndex + 1;
  if (nextIndex < 0 || nextIndex >= questions.length) return null;
  return questions[nextIndex] ?? null;
};
