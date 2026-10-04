import type { QuestionType } from '@/lib/assessment-api';
import type { EditorLayoutMode } from '@/lib/use-editor-layout';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEditorCopy } from './use-editor-copy';

type EditorHeaderProps = {
  assessmentTitle: string;
  isSaving: boolean;
  ready: boolean;
  onSaveDraft: () => void;
  layout: EditorLayoutMode;
  onLayoutChange: (layout: EditorLayoutMode) => void;
  isStudentView: boolean;
  onToggleStudentView: () => void;
  onOpenAssessmentSettings: () => void;
  onOpenPrintEditor: () => void;
  canOpenPrintEditor: boolean;
  isQuestionEditingLocked?: boolean;
  saveStatus?: string | null;
  estimatedAverageCorrectRate?: number | null;
  questionTypeCounts: Record<QuestionType, number>;
  totalPoints: number;
  missingPointsCount: number;
};

export const EditorHeader = ({
  assessmentTitle,
  isSaving,
  ready,
  onSaveDraft,
  layout,
  onLayoutChange,
  isStudentView,
  onToggleStudentView,
  onOpenAssessmentSettings,
  onOpenPrintEditor,
  canOpenPrintEditor,
  isQuestionEditingLocked = false,
  saveStatus,
  estimatedAverageCorrectRate,
  questionTypeCounts,
  totalPoints,
  missingPointsCount,
}: EditorHeaderProps) => {
  const copy = useEditorCopy();
  const layoutOptions: Array<{ label: string; value: EditorLayoutMode }> = [
    { label: copy.layoutOptions.studio, value: 'studio' },
    { label: copy.layoutOptions.document, value: 'document' },
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold text-[#2b2621] font-[var(--font-display)] sm:text-2xl">
            <span className="min-w-0 truncate">
              {copy.header.titlePrefix} {assessmentTitle}
            </span>
            {typeof estimatedAverageCorrectRate === 'number' ? (
              <span className="rounded-full border border-[#e1d6c8] bg-[#fcfaf5] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[#8b7a69] sm:tracking-[0.2em]">
                {copy.labels.estimatedAverage} {estimatedAverageCorrectRate}%
              </span>
            ) : null}
          </h1>
          {copy.header.subtitle ? (
            <p className="mt-2 max-w-2xl text-sm text-[#6b5c4d]">{copy.header.subtitle}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            {(Object.entries(questionTypeCounts) as Array<[QuestionType, number]>).map(
              ([type, count]) =>
                count > 0 ? (
                  <span
                    key={`type-count-${type}`}
                    className="rounded-full border border-[#e1d6c8] bg-[#fcfaf5] px-2 py-0.5 font-semibold text-[#6b5c4d]"
                  >
                    {copy.labels.questionTypeShortLabels[type]} {count}
                  </span>
                ) : null,
            )}
            <span className="rounded-full border border-[#e1d6c8] bg-[#fcfaf5] px-2 py-0.5 font-semibold text-[#6b5c4d]">
              {copy.labels.totalPoints} {totalPoints}
            </span>
            {missingPointsCount > 0 ? (
              <span className="rounded-full border border-[#ebd8bf] bg-[#fff6e9] px-2 py-0.5 font-semibold text-[#7a5a34]">
                {copy.labels.missingPoints(missingPointsCount)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
          {saveStatus ? (
            <span className="rounded-full border border-[#e1d6c8] bg-[#fcfaf5] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[#8b7a69] sm:tracking-[0.2em]">
              {saveStatus}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenPrintEditor}
            disabled={!canOpenPrintEditor}
            className="border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c]"
          >
            {copy.header.printEditorLabel}
          </Button>
          <Button
            onClick={onSaveDraft}
            disabled={isSaving || !ready || isQuestionEditingLocked}
            size="sm"
            className="bg-[#c86b3c] text-white hover:bg-[#b45d33]"
          >
            {copy.actions.saveChanges}
          </Button>
        </div>
      </div>

      <div className="border-t border-[#e8dfd3] pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label={copy.a11y.layoutToggle}
            className="inline-flex items-center rounded-lg border border-[#e1d6c8] bg-[#fcfaf5] p-1"
          >
            {layoutOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={layout === option.value}
                onClick={() => onLayoutChange(option.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                  layout === option.value
                    ? 'bg-[#2b2621] text-[#f6f1e8] shadow-sm'
                    : 'text-[#8b7a69] hover:text-[#2b2621]',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleStudentView}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
              isStudentView
                ? 'border-[#c86b3c] bg-[#c86b3c] text-white shadow-sm'
                : 'border-[#e1d6c8] bg-[#fcfaf5] text-[#6b5c4d] hover:border-[#c86b3c]/70 hover:text-[#2b2621]',
            )}
          >
            {copy.header.studentViewLabel}
          </Button>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#e1d6c8] text-[#6b5c4d] hover:border-[#c86b3c] hover:text-[#c86b3c]"
                >
                  {copy.actions.more}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={onOpenAssessmentSettings}>
                  {copy.header.assessmentSettingsLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
};
