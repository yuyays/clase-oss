import type { DraftQuestion } from '@/lib/use-editor-draft';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useEditorCopy } from './use-editor-copy';

type QuestionInspectorPanelProps = {
  selectedQuestion: DraftQuestion | null;
  onQuestionTypeChange: (value: DraftQuestion['type']) => void;
  onCorrectAnswerChange: (field: 'label' | 'text', value: string) => void;
  onPointsChange: (value: string) => void;
  isReadOnly?: boolean;
};

export const QuestionInspectorPanel = ({
  selectedQuestion,
  onQuestionTypeChange,
  onCorrectAnswerChange,
  onPointsChange,
  isReadOnly = false,
}: QuestionInspectorPanelProps) => {
  const copy = useEditorCopy();

  return (
    <Card className="min-w-0 rounded-2xl border border-[#e1d6c8] bg-gradient-to-b from-[#f8f2e8] via-[#fdf9f2] to-[#f6eee1] shadow-sm">
      <CardHeader>
        <div>
          <CardTitle className="text-[#2b2621]">{copy.labels.questionSettings}</CardTitle>
          <CardDescription className="text-[#6b5c4d]">
            {copy.labels.questionSettingsDescription}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {!selectedQuestion ? (
          <div className="rounded-lg border border-dashed border-[#e1d6c8] bg-[#f7f1e6] p-4 text-sm text-[#8b7a69]">
            {copy.empty.selectQuestionSettings}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]">
                {copy.labels.questionType}
              </Label>
              <Select
                value={selectedQuestion.type}
                onValueChange={(value) => onQuestionTypeChange(value as DraftQuestion['type'])}
                disabled={isReadOnly}
              >
                <SelectTrigger className="w-full border-[#e1d6c8] bg-white/90">
                  <SelectValue placeholder={copy.labels.questionType} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(copy.questionTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {selectedQuestion.type === 'true_false' ? (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]">
                  {copy.labels.correctText}
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
                    disabled={isReadOnly}
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
                    disabled={isReadOnly}
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
            ) : selectedQuestion.type === 'short_answer' || selectedQuestion.type === 'written' ? (
              <div className="space-y-2">
                <Label
                  htmlFor="inspector-correct-example"
                  className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]"
                >
                  {copy.labels.correctText}
                </Label>
                <Input
                  id="inspector-correct-example"
                  value={selectedQuestion.correctAnswer.text}
                  onChange={(event) => onCorrectAnswerChange('text', event.target.value)}
                  disabled={isReadOnly}
                  placeholder={copy.placeholders.correctExample}
                  className="border-[#e1d6c8] bg-white/90 text-[#2b2621]"
                />
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="inspector-correct-label"
                    className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]"
                  >
                    {copy.labels.correctLabel}
                  </Label>
                  <Input
                    id="inspector-correct-label"
                    value={selectedQuestion.correctAnswer.label}
                    onChange={(event) => onCorrectAnswerChange('label', event.target.value)}
                    disabled={isReadOnly}
                    placeholder={copy.placeholders.correctLabel}
                    className="border-[#e1d6c8] bg-white/90 text-[#2b2621]"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="inspector-correct-text"
                    className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]"
                  >
                    {copy.labels.correctText}
                  </Label>
                  <Input
                    id="inspector-correct-text"
                    value={selectedQuestion.correctAnswer.text}
                    onChange={(event) => onCorrectAnswerChange('text', event.target.value)}
                    disabled={isReadOnly}
                    placeholder={copy.placeholders.correctText}
                    className="border-[#e1d6c8] bg-white/90 text-[#2b2621]"
                  />
                </div>
              </div>
            )}

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="inspector-points"
                  className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]"
                >
                  {copy.labels.points}
                </Label>
                <Input
                  id="inspector-points"
                  type="number"
                  min="0"
                  step="1"
                  value={selectedQuestion.points ?? ''}
                  onChange={(event) => onPointsChange(event.target.value)}
                  disabled={isReadOnly}
                  placeholder={copy.placeholders.points}
                  className="border-[#e1d6c8] bg-white/90 text-[#2b2621]"
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
