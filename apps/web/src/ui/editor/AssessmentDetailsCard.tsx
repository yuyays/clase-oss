import type { AssessmentCategory } from '@/lib/assessment-api';
import type { AssessmentDraft } from '@/lib/use-editor-draft';

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
import { Textarea } from '@/components/ui/textarea';

import { useEditorCopy } from './use-editor-copy';

type AssessmentDetailsCardProps = {
  assessment: AssessmentDraft;
  onAssessmentChange: (
    field: keyof AssessmentDraft,
    value: AssessmentDraft[keyof AssessmentDraft],
  ) => void;
};

const toOptional = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const AssessmentDetailsCard = ({
  assessment,
  onAssessmentChange,
}: AssessmentDetailsCardProps) => {
  const copy = useEditorCopy();

  return (
    <Card className="min-w-0 rounded-2xl border border-[#e1d6c8] bg-[#fcfaf5] shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-[#2b2621]">{copy.labels.assessmentDetails}</CardTitle>
        <CardDescription className="text-[#6b5c4d]">
          {copy.labels.assessmentDetailsDescription}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-5">
        <p className="text-xs text-[#8b7a69]">{copy.labels.editableHint}</p>
        <div className="rounded-xl border border-[#e1d6c8] bg-white/90 p-3 sm:p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label
                htmlFor="assessment-title"
                className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]"
              >
                {copy.labels.title}
              </Label>
              <div className="group relative rounded-lg border border-transparent px-2 py-1 transition hover:border-[#c86b3c]/40 hover:bg-white focus-within:border-[#c86b3c]/70 focus-within:ring-2 focus-within:ring-[#c86b3c]/20">
                <Input
                  id="assessment-title"
                  value={assessment.title}
                  onChange={(event) => onAssessmentChange('title', event.target.value)}
                  className="h-auto border-0 bg-transparent px-0 py-0 text-lg font-semibold text-[#2b2621] shadow-none focus-visible:border-0 focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]">
                {copy.labels.category}
              </Label>
              <div className="group relative rounded-lg border border-transparent px-2 py-1 transition hover:border-[#c86b3c]/40 hover:bg-white focus-within:border-[#c86b3c]/70 focus-within:ring-2 focus-within:ring-[#c86b3c]/20">
                <Select
                  value={assessment.assessmentCategory ?? 'none'}
                  onValueChange={(value) =>
                    onAssessmentChange(
                      'assessmentCategory',
                      value === 'none' ? null : (value as AssessmentCategory),
                    )
                  }
                >
                  <SelectTrigger className="w-full border-[#e1d6c8] bg-white/90">
                    <SelectValue placeholder={copy.placeholders.chooseCategory} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {copy.assessmentCategoryLabels.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#e1d6c8] bg-white/90 p-3 sm:p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label
                htmlFor="assessment-subject"
                className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]"
              >
                {copy.labels.subject}
              </Label>
              <div className="group relative rounded-lg border border-transparent px-2 py-1 transition hover:border-[#c86b3c]/40 hover:bg-white focus-within:border-[#c86b3c]/70 focus-within:ring-2 focus-within:ring-[#c86b3c]/20">
                <Input
                  id="assessment-subject"
                  value={assessment.subject ?? ''}
                  onChange={(event) =>
                    onAssessmentChange('subject', toOptional(event.target.value))
                  }
                  placeholder={copy.placeholders.subject}
                  className="h-auto border-0 bg-transparent px-0 py-0 text-base text-[#2b2621] shadow-none focus-visible:border-0 focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="assessment-grade"
                className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]"
              >
                {copy.labels.grade}
              </Label>
              <div className="group relative rounded-lg border border-transparent px-2 py-1 transition hover:border-[#c86b3c]/40 hover:bg-white focus-within:border-[#c86b3c]/70 focus-within:ring-2 focus-within:ring-[#c86b3c]/20">
                <Input
                  id="assessment-grade"
                  value={assessment.grade ?? ''}
                  onChange={(event) => onAssessmentChange('grade', toOptional(event.target.value))}
                  placeholder={copy.placeholders.grade}
                  className="h-auto border-0 bg-transparent px-0 py-0 text-base text-[#2b2621] shadow-none focus-visible:border-0 focus-visible:ring-0"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-2 rounded-xl border border-[#e1d6c8] bg-white/90 p-3 sm:p-4">
          <Label
            htmlFor="assessment-custom-category"
            className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]"
          >
            {copy.labels.customCategory}
          </Label>
          <div className="group relative rounded-lg border border-transparent px-2 py-1 transition hover:border-[#c86b3c]/40 hover:bg-white focus-within:border-[#c86b3c]/70 focus-within:ring-2 focus-within:ring-[#c86b3c]/20">
            <Input
              id="assessment-custom-category"
              value={assessment.customCategoryLabel ?? ''}
              onChange={(event) =>
                onAssessmentChange('customCategoryLabel', toOptional(event.target.value))
              }
              placeholder={copy.placeholders.customCategory}
              className="h-auto border-0 bg-transparent px-0 py-0 text-base text-[#2b2621] shadow-none focus-visible:border-0 focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="space-y-2 rounded-xl border border-[#e1d6c8] bg-white/90 p-3 sm:p-4">
          <Label
            htmlFor="assessment-description"
            className="text-xs uppercase tracking-[0.2em] text-[#8b7a69]"
          >
            {copy.labels.description}
          </Label>
          <div className="group relative rounded-lg border border-transparent px-2 py-1 transition hover:border-[#c86b3c]/40 hover:bg-white focus-within:border-[#c86b3c]/70 focus-within:ring-2 focus-within:ring-[#c86b3c]/20">
            <Textarea
              id="assessment-description"
              value={assessment.description ?? ''}
              onChange={(event) =>
                onAssessmentChange('description', toOptional(event.target.value))
              }
              placeholder={copy.placeholders.description}
              className="min-h-20 border-0 bg-transparent px-0 py-0 text-base leading-7 text-[#2b2621] shadow-none focus-visible:border-0 focus-visible:ring-0"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
