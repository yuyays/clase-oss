import type { ReactNode } from 'react';

import type { EditorLayoutMode } from '@/lib/use-editor-layout';
import type { DraftQuestion } from '@/lib/use-editor-draft';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

import { useEditorCopy } from './use-editor-copy';

type QuestionEditorCardProps = {
  selectedQuestion: DraftQuestion | null;
  layout: EditorLayoutMode;
  questionTypeControl?: ReactNode;
  onPromptChange: (value: string) => void;
  onAddChoice: () => void;
  onChoiceChange: (index: number, value: string) => void;
  onChoiceRemove: (index: number) => void;
  onCorrectAnswerChange: (field: 'label' | 'text', value: string) => void;
  onPointsChange: (value: string) => void;
  showAnswerFields?: boolean;
  showScoringFields?: boolean;
  metricsPanel?: ReactNode;
  onSaveDraft?: () => void;
  onConfirmNext?: () => void | Promise<void>;
  isSaving?: boolean;
  isReadOnly?: boolean;
  isDirty?: boolean;
  saveStatusLabel?: string | null;
  isGenerating?: boolean;
};

export const QuestionEditorCard = ({
  selectedQuestion,
  layout,
  questionTypeControl,
  onPromptChange,
  onAddChoice,
  onChoiceChange,
  onChoiceRemove,
  onCorrectAnswerChange,
  onPointsChange,
  showAnswerFields = true,
  showScoringFields = true,
  metricsPanel,
  onSaveDraft,
  onConfirmNext,
  isSaving = false,
  isReadOnly = false,
  isDirty = false,
  saveStatusLabel = null,
  isGenerating = false,
}: QuestionEditorCardProps) => {
  const copy = useEditorCopy();
  const isDocumentLayout = layout === 'document';
  const isInputLocked = isReadOnly || isGenerating;
  const footerStatus = isSaving
    ? copy.status.savingTitle
    : isDirty
      ? copy.status.unsavedTitle
      : (saveStatusLabel ?? copy.status.savedTitle);

  return (
    <div className="min-w-0 rounded-2xl border border-[#e1d6c8] bg-gradient-to-b from-[#f8f2e8] via-[#fdf9f2] to-[#f6eee1] p-3 shadow-sm sm:p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-[0.18em] text-[#8b7a69] sm:text-xs sm:tracking-[0.3em]">
            {copy.labels.questionEditor}
          </p>
          {copy.labels.questionEditorDescription ? (
            <h2 className="mt-2 text-xl font-semibold text-[#2b2621]">
              {copy.labels.questionEditorDescription}
            </h2>
          ) : null}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {questionTypeControl}
          {onSaveDraft ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onSaveDraft}
              disabled={isSaving || isInputLocked}
              className="border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c]"
            >
              {copy.actions.save}
            </Button>
          ) : null}
        </div>
      </div>
      {isReadOnly ? (
        <p className="mt-2 text-xs text-[#8b7a69]">{copy.status.parsingLockedHint}</p>
      ) : null}
      {isGenerating ? (
        <p className="mt-2 text-xs text-[#8b7a69]">{copy.status.generationLockedHint}</p>
      ) : null}
      {selectedQuestion ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#8b7a69]">
          <span>
            {copy.questionList.prefix}
            {selectedQuestion.orderIndex}
          </span>
          <Separator orientation="vertical" className="h-3" />
          <span>{copy.questionTypeLabels[selectedQuestion.type]}</span>
        </div>
      ) : null}
      <div className="mt-5 min-w-0 space-y-5 sm:mt-6 sm:space-y-6">
        {!selectedQuestion ? (
          <div className="rounded-lg border border-dashed border-[#e1d6c8] bg-[#f7f1e6] p-5 text-sm text-[#8b7a69] md:p-6">
            {copy.empty.selectQuestion}
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              {metricsPanel}
              <p className="text-xs text-[#8b7a69]">{copy.labels.editableHint}</p>
            </div>
            <div className="space-y-3 rounded-xl border border-[#e4d8c8] bg-white/70 p-4">
              <Label
                htmlFor="question-prompt"
                className="text-xs uppercase tracking-[0.2em] text-[#7f7468]"
              >
                {copy.labels.stepPrompt}
              </Label>
              <div className="group relative rounded-lg border border-transparent bg-white/80 px-3 py-2 transition hover:border-[#c86b3c]/40 hover:bg-white focus-within:border-[#c86b3c]/70 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#c86b3c]/20">
                <Textarea
                  id="question-prompt"
                  value={selectedQuestion.prompt}
                  onChange={(event) => onPromptChange(event.target.value)}
                  disabled={isInputLocked}
                  placeholder={copy.placeholders.prompt}
                  className={
                    isDocumentLayout
                      ? 'min-h-0 border-0 bg-transparent px-0 py-0 text-xl leading-8 text-[#2b2621] shadow-none focus-visible:border-0 focus-visible:ring-0'
                      : 'min-h-0 border-0 bg-transparent px-0 py-0 text-lg leading-7 text-[#2b2621] shadow-none focus-visible:border-0 focus-visible:ring-0'
                  }
                />
              </div>
            </div>

            {selectedQuestion.type === 'multiple_choice' ? (
              <div className="space-y-3 border-t border-[#e1d6c8]/80 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-xs uppercase tracking-[0.2em] text-[#7f7468]">
                    {copy.labels.stepAnswer}
                  </Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onAddChoice}
                    disabled={isInputLocked}
                    className="border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c]"
                  >
                    {copy.actions.addChoice}
                  </Button>
                </div>
                <div className="grid gap-3">
                  {selectedQuestion.choices.map((choice, index) => (
                    <div
                      key={`${selectedQuestion.id}-choice-${index}`}
                      className="group relative flex min-w-0 items-center gap-2 rounded-lg border border-[#e1d6c8] bg-white px-3 py-2 shadow-sm transition hover:border-[#c86b3c]/40 focus-within:border-[#c86b3c]/70 focus-within:ring-2 focus-within:ring-[#c86b3c]/20"
                    >
                      <span className="text-xs font-semibold text-[#8b7a69]">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <Input
                        value={choice}
                        onChange={(event) => onChoiceChange(index, event.target.value)}
                        disabled={isInputLocked}
                        className="h-auto min-w-0 border-0 bg-transparent px-0 py-0 text-sm text-[#2b2621] shadow-none focus-visible:border-0 focus-visible:ring-0"
                        placeholder={`${copy.placeholders.choicePrefix} ${index + 1}`}
                      />
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => onChoiceRemove(index)}
                        disabled={isInputLocked}
                      >
                        x
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {showAnswerFields ? (
              selectedQuestion.type === 'true_false' ? (
                <div className="space-y-3 border-t border-[#e1d6c8]/80 pt-5">
                  <Label className="text-xs uppercase tracking-[0.2em] text-[#7f7468]">
                    {copy.labels.stepAnswer}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={
                        selectedQuestion.correctAnswer.text === copy.previewDefaults.trueLabel
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() => {
                        onCorrectAnswerChange('text', copy.previewDefaults.trueLabel);
                        onCorrectAnswerChange('label', '');
                      }}
                      disabled={isInputLocked}
                      className={
                        selectedQuestion.correctAnswer.text === copy.previewDefaults.trueLabel
                          ? 'bg-[#c86b3c] text-white hover:bg-[#b45d33]'
                          : 'border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c]'
                      }
                    >
                      {copy.previewDefaults.trueLabel}
                    </Button>
                    <Button
                      type="button"
                      variant={
                        selectedQuestion.correctAnswer.text === copy.previewDefaults.falseLabel
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() => {
                        onCorrectAnswerChange('text', copy.previewDefaults.falseLabel);
                        onCorrectAnswerChange('label', '');
                      }}
                      disabled={isInputLocked}
                      className={
                        selectedQuestion.correctAnswer.text === copy.previewDefaults.falseLabel
                          ? 'bg-[#c86b3c] text-white hover:bg-[#b45d33]'
                          : 'border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c]'
                      }
                    >
                      {copy.previewDefaults.falseLabel}
                    </Button>
                  </div>
                </div>
              ) : selectedQuestion.type === 'short_answer' ||
                selectedQuestion.type === 'written' ? (
                <div className="space-y-2 border-t border-[#e1d6c8]/80 pt-5">
                  <Label
                    htmlFor="correct-example"
                    className="text-xs uppercase tracking-[0.2em] text-[#7f7468]"
                  >
                    {copy.labels.stepAnswer}
                  </Label>
                  <Input
                    id="correct-example"
                    value={selectedQuestion.correctAnswer.text}
                    onChange={(event) => onCorrectAnswerChange('text', event.target.value)}
                    disabled={isInputLocked}
                    placeholder={copy.placeholders.correctExample}
                    className="border-[#e1d6c8] bg-white/90 text-[#2b2621]"
                  />
                </div>
              ) : (
                <div className="grid gap-4 border-t border-[#e1d6c8]/80 pt-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label
                      htmlFor="correct-label"
                      className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]"
                    >
                      {copy.labels.correctLabel}
                    </Label>
                    <Input
                      id="correct-label"
                      value={selectedQuestion.correctAnswer.label}
                      onChange={(event) => onCorrectAnswerChange('label', event.target.value)}
                      disabled={isInputLocked}
                      placeholder={copy.placeholders.correctLabel}
                      className="border-[#e1d6c8] bg-white/90 text-[#2b2621]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="correct-text"
                      className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]"
                    >
                      {copy.labels.correctText}
                    </Label>
                    <Input
                      id="correct-text"
                      value={selectedQuestion.correctAnswer.text}
                      onChange={(event) => onCorrectAnswerChange('text', event.target.value)}
                      disabled={isInputLocked}
                      placeholder={copy.placeholders.correctText}
                      className="border-[#e1d6c8] bg-white/90 text-[#2b2621]"
                    />
                  </div>
                </div>
              )
            ) : null}

            {showScoringFields ? (
              <div className="grid gap-4 border-t border-[#e1d6c8]/80 pt-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="question-points"
                    className="text-xs uppercase tracking-[0.2em] text-[#7f7468]"
                  >
                    {copy.labels.stepScoring}
                  </Label>
                  <Input
                    id="question-points"
                    type="number"
                    min="0"
                    step="1"
                    value={selectedQuestion.points ?? ''}
                    onChange={(event) => onPointsChange(event.target.value)}
                    disabled={isInputLocked}
                    placeholder={copy.placeholders.points}
                    className="border-[#e1d6c8] bg-white/90 text-[#2b2621]"
                  />
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {selectedQuestion ? (
        <div className="sticky bottom-0 mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e1d6c8] bg-[#fffaf2]/95 px-3 py-2.5 backdrop-blur md:mt-6 md:gap-3 md:px-4 md:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7f7468] md:text-xs md:tracking-[0.16em]">
            {footerStatus}
          </p>
          {onConfirmNext ? (
            <Button
              size="xs"
              onClick={onConfirmNext}
              disabled={isSaving || isInputLocked || !selectedQuestion}
              className="bg-[#c86b3c] text-white hover:bg-[#b45d33] md:h-9 md:px-4 md:text-sm"
            >
              {copy.actions.confirmNext}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
