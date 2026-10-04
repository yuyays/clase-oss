import { useEffect, useRef, useState, type DragEvent } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MathText } from '@/components/math-text';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { DraftQuestion } from '@/lib/use-editor-draft';
import type { QuestionMetrics } from '@/lib/use-question-metrics';

import { useEditorCopy } from './use-editor-copy';
import { getQuestionReviewStatus } from './question-review';

type QuestionListPanelProps = {
  questions: DraftQuestion[];
  selectedQuestionId: string | null;
  onSelectQuestion: (questionId: string) => void;
  onAddQuestion: () => void;
  onMoveQuestion: (direction: 'up' | 'down', questionId?: string) => void;
  onReorderQuestion: (questionId: string, targetIndex: number) => void;
  onDeleteQuestion: () => void;
  isSaving: boolean;
  isReadOnly?: boolean;
  getQuestionMetrics: (questionId: string) => QuestionMetrics | null;
  className?: string;
};

export const QuestionListPanel = ({
  questions,
  selectedQuestionId,
  onSelectQuestion,
  onAddQuestion,
  onMoveQuestion,
  onReorderQuestion,
  onDeleteQuestion,
  isSaving,
  isReadOnly = false,
  getQuestionMetrics,
  className,
}: QuestionListPanelProps) => {
  const copy = useEditorCopy();
  const statusLabels = copy.questionList.statusLabels;
  const [jumpValue, setJumpValue] = useState('');
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const statusStyles = {
    reviewed: 'border-emerald-200/80 bg-emerald-50 text-emerald-700',
    'needs-review': 'border-amber-200/80 bg-amber-50 text-amber-700',
    untouched: 'border-[#e1d6c8] bg-[#f7f1e6] text-[#8b7a69]',
  } as const;
  const statusDots = {
    reviewed: 'bg-emerald-500',
    'needs-review': 'bg-amber-500',
    untouched: 'bg-[#9c948b]',
  } as const;
  const canJump = questions.length >= 10;

  useEffect(() => {
    if (!selectedQuestionId) return;
    itemRefs.current[selectedQuestionId]?.scrollIntoView({ block: 'nearest' });
  }, [selectedQuestionId]);

  const handleJump = () => {
    const target = Number.parseInt(jumpValue, 10);
    if (Number.isNaN(target)) return;
    const bounded = Math.max(1, Math.min(target, questions.length));
    const targetQuestion = questions[bounded - 1];
    if (!targetQuestion) return;
    onSelectQuestion(targetQuestion.id);
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, questionId: string) => {
    if (isReadOnly || isSaving) return;
    setDraggedQuestionId(questionId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', questionId);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, questionId: string) => {
    if (!draggedQuestionId || draggedQuestionId === questionId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverQuestionId(questionId);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetIndex: number) => {
    event.preventDefault();
    const sourceQuestionId = draggedQuestionId || event.dataTransfer.getData('text/plain');
    if (!sourceQuestionId) return;
    onReorderQuestion(sourceQuestionId, targetIndex);
    setDraggedQuestionId(null);
    setDragOverQuestionId(null);
  };

  const handleDragEnd = () => {
    setDraggedQuestionId(null);
    setDragOverQuestionId(null);
  };

  return (
    <Card
      className={cn(
        'flex h-full min-w-0 flex-col rounded-2xl border border-[#e1d6c8] bg-gradient-to-b from-[#f8f2e8] via-[#fdf9f2] to-[#f6eee1] p-3 shadow-sm sm:p-4 md:p-5',
        className,
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-[0.18em] text-[#8b7a69] sm:text-xs sm:tracking-[0.3em]">
            {copy.labels.questions}
          </p>
          <div className="mt-2 flex items-center gap-1 opacity-80">
            <Button
              size="xs"
              variant="outline"
              onClick={onAddQuestion}
              disabled={isSaving || isReadOnly}
              className="border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c]"
            >
              {copy.labels.railActions.add}
            </Button>
            <Button
              size="xs"
              variant="destructive"
              onClick={onDeleteQuestion}
              disabled={!selectedQuestionId || isSaving || isReadOnly}
            >
              {copy.labels.railActions.delete}
            </Button>
          </div>
        </div>
        <Badge variant="outline" className="border-[#e1d6c8] text-[#6b5c4d]">
          {questions.length}
        </Badge>
      </div>
      {canJump ? (
        <div className="mt-3 flex items-center gap-2">
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            value={jumpValue}
            onChange={(event) => setJumpValue(event.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleJump();
              }
            }}
            placeholder="#"
            className="h-7 border-[#e1d6c8] bg-white"
          />
          <Button
            size="xs"
            variant="outline"
            onClick={handleJump}
            disabled={isSaving}
            className="border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c]"
          >
            {copy.labels.go}
          </Button>
        </div>
      ) : null}
      <div className="mt-4 flex-1 min-w-0 space-y-2 overflow-y-auto pr-1">
        {questions.length === 0 ? (
          <p className="text-xs text-[#8b7a69]">{copy.empty.noQuestions}</p>
        ) : (
          questions.map((question, index) => {
            const status = getQuestionReviewStatus(question);
            const hasPoints = typeof question.points === 'number';
            const isSelected = question.id === selectedQuestionId;
            const metrics = isSelected ? getQuestionMetrics(question.id) : null;
            const correctRate = metrics?.estimatedCorrectRate ?? null;
            return (
              <div
                key={question.id}
                className={cn(
                  'group flex min-w-0 items-center gap-1.5 rounded-lg transition',
                  dragOverQuestionId === question.id ? 'bg-[#f7e1d2]/50' : '',
                )}
                draggable={!isReadOnly && !isSaving}
                onDragStart={(event) => handleDragStart(event, question.id)}
                onDragOver={(event) => handleDragOver(event, question.id)}
                onDrop={(event) => handleDrop(event, index)}
                onDragEnd={handleDragEnd}
              >
                <button
                  ref={(element) => {
                    itemRefs.current[question.id] = element;
                  }}
                  type="button"
                  onClick={() => onSelectQuestion(question.id)}
                  className={cn(
                    'relative min-w-0 flex-1 rounded-lg border px-3 py-2 text-left transition',
                    isSelected
                      ? 'border-[#c86b3c]/50 bg-[#f7e1d2]/40 text-[#2b2621] shadow-sm before:absolute before:left-0.5 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-[#c86b3c]'
                      : 'border-[#e1d6c8] bg-white/90 text-[#2b2621] hover:border-[#c86b3c]/40 hover:bg-[#f9efe4]',
                    draggedQuestionId === question.id ? 'opacity-60' : '',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{question.orderIndex}</p>
                    <div className="flex items-center gap-1">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
                          statusStyles[status],
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', statusDots[status])} />
                        {statusLabels[status]}
                      </span>
                      {hasPoints ? (
                        <span className="text-[10px] font-semibold text-[#7f7468]">
                          {question.points}
                          {copy.labels.points}
                        </span>
                      ) : (
                        <span className="rounded-full border border-[#ebd8bf] bg-[#fff6e9] px-1.5 py-0.5 text-[9px] font-semibold text-[#7a5a34]">
                          {copy.labels.pointsMissingShort}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-[#6b5c4d]">
                    <MathText text={question.prompt} fallback={copy.questionList.untitled} />
                  </p>
                  {isSelected ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#8b7a69]">
                      <span>{copy.questionTypeLabels[question.type]}</span>
                      <span className="h-1 w-1 rounded-full bg-[#c7bbac]" />
                      <span>
                        {copy.labels.estimatedCorrectRate}{' '}
                        {typeof correctRate === 'number' ? `${correctRate}%` : '—'}
                      </span>
                    </div>
                  ) : null}
                </button>
                {!isReadOnly ? (
                  <div className="flex flex-col gap-1">
                    <Button
                      size="icon-xs"
                      variant="outline"
                      onClick={() => onMoveQuestion('up', question.id)}
                      disabled={index <= 0 || isSaving}
                      aria-label={`${copy.labels.railActions.moveUp} ${question.orderIndex}`}
                    >
                      ↑
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="outline"
                      onClick={() => onMoveQuestion('down', question.id)}
                      disabled={index >= questions.length - 1 || isSaving}
                      aria-label={`${copy.labels.railActions.moveDown} ${question.orderIndex}`}
                    >
                      ↓
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
};
