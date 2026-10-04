import { useAssessment, useDraftQuestions } from '@/lib/assessment-api';
import { NEW_ASSESSMENT_ID } from '@/ui/editor/editor-constants';

type UseEditorDataParams = {
  selectedAssessmentId: string | null;
  initialAssessmentId?: string | null;
};

export const useEditorData = ({
  selectedAssessmentId,
  initialAssessmentId = null,
}: UseEditorDataParams) => {
  const isNewSelection = selectedAssessmentId === NEW_ASSESSMENT_ID;
  const activeAssessmentId = isNewSelection ? null : (selectedAssessmentId ?? initialAssessmentId);

  const {
    data: assessment,
    isLoading: isAssessmentLoading,
    error: assessmentError,
    refetch: refetchAssessment,
  } = useAssessment(activeAssessmentId);
  const {
    data: draftQuestionsData,
    isLoading: isQuestionsLoading,
    error: questionsError,
    refetch: refetchQuestions,
  } = useDraftQuestions(activeAssessmentId);

  const isLoading = activeAssessmentId ? isAssessmentLoading || isQuestionsLoading : false;
  const ready = !activeAssessmentId || Boolean(assessment && draftQuestionsData);

  return {
    assessments: assessment ? [assessment] : [],
    activeAssessmentId,
    assessment: assessment ?? null,
    questions: draftQuestionsData?.questions ?? [],
    assessmentVersionId: draftQuestionsData?.assessmentVersion?.id ?? null,
    isLoading,
    ready,
    loadError: assessmentError || questionsError,
    retryLoad: () => Promise.all([refetchAssessment(), refetchQuestions()]),
  };
};
