import { cn } from '@/lib/utils';
import type { QuestionMetrics } from '@/lib/use-question-metrics';

import { Button } from '@/components/ui/button';

import { useEditorCopy } from './use-editor-copy';

type QuestionMetricsPanelProps = {
  metrics: QuestionMetrics | null;
  onGenerate?: () => void;
  onGenerateSimilar?: () => void;
  isGenerating?: boolean;
  disabled?: boolean;
  className?: string;
};

export const QuestionMetricsPanel = ({
  metrics,
  onGenerate,
  onGenerateSimilar,
  isGenerating = false,
  disabled = false,
  className,
}: QuestionMetricsPanelProps) => {
  const copy = useEditorCopy();
  const estimated = metrics?.estimatedCorrectRate;
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <div
        className={cn(
          'text-xs uppercase tracking-[0.2em] text-[#8b7a69] transition-opacity',
          isGenerating ? 'opacity-60' : 'opacity-100',
        )}
      >
        {copy.labels.estimatedCorrectRate}{' '}
        <span className="font-semibold text-[#2b2621]">
          {typeof estimated === 'number' ? `${estimated}%` : '—'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="xs"
          variant="outline"
          onClick={onGenerate}
          disabled={disabled || isGenerating || !onGenerate}
          className="border-[#e1d6c8] text-[#6b5c4d]"
        >
          {isGenerating ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
              {copy.actions.generatingQuestion}
            </span>
          ) : (
            copy.actions.generateTargetQuestion
          )}
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={onGenerateSimilar}
          disabled={disabled || isGenerating || !onGenerateSimilar}
          className="border-[#e1d6c8] text-[#6b5c4d]"
        >
          {copy.actions.generateSimilarQuestion}
        </Button>
      </div>
    </div>
  );
};
