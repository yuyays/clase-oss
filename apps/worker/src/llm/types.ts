export type ParsedQuestion = {
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'written' | 'other';
  prompt: string;
  choices?: string[] | null;
  correctAnswer?: { label: string | null; text: string | null } | null;
  points?: number | null;
  orderIndex?: number | null;
};

export type AssessmentMeta = {
  title: string | null;
  subject: string | null;
  grade: string | null;
};

export type LlmUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type LlmDiagnostics = {
  llmCallMs?: number;
  providerRequestId?: string | null;
  openaiFileUploadMs?: number;
  openaiResponsesMs?: number;
};

export type LlmParseResult = {
  questions: ParsedQuestion[];
  assessmentMeta?: AssessmentMeta | null;
  usage?: LlmUsage;
  diagnostics?: LlmDiagnostics;
};
