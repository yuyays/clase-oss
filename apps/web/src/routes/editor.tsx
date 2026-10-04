import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { useEditorData } from '@/lib/use-editor-data';
import { AssessmentAccessState } from '@/ui/AssessmentAccessState';
import { EditorLayout } from '@/ui/editor/EditorLayout';
import { NEW_ASSESSMENT_ID } from '@/ui/editor/editor-constants';

type EditorRouteProps = {
  initialAssessmentId?: string | null;
};

export const EditorRoute = ({ initialAssessmentId = null }: EditorRouteProps) => {
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const navigate = useNavigate();

  const {
    assessments,
    activeAssessmentId,
    assessment,
    questions,
    assessmentVersionId,
    isLoading,
    ready,
    loadError,
    retryLoad,
  } = useEditorData({
    selectedAssessmentId,
    initialAssessmentId,
  });

  const displayAssessmentId = selectedAssessmentId ?? activeAssessmentId;

  if (loadError) {
    return <AssessmentAccessState error={loadError} onRetry={() => void retryLoad()} />;
  }

  const handleSelectAssessment = (assessmentId: string) => {
    setSelectedAssessmentId(assessmentId);
    if (assessmentId === NEW_ASSESSMENT_ID) {
      void navigate({ to: '/editor/new', replace: true });
      return;
    }
    void navigate({ to: '/editor/$assessmentId', params: { assessmentId } });
  };

  return (
    <EditorLayout
      assessments={assessments}
      selectedAssessmentId={displayAssessmentId}
      onSelectAssessment={handleSelectAssessment}
      assessment={assessment}
      questions={questions}
      assessmentVersionId={assessmentVersionId}
      isLoading={isLoading}
      ready={ready}
    />
  );
};
