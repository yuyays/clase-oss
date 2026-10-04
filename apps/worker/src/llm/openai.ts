import { performance } from 'node:perf_hooks';

import { questionsJsonSchema } from '@clase/shared';
import { workerEnv } from '@clase/shared/server';

import type { AssessmentMeta, LlmParseResult, ParsedQuestion } from './types.js';

const OPENAI_URL = 'https://api.openai.com/v1/responses';

const questionGenerationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: questionsJsonSchema.properties.questions,
  },
} as const;

const systemPrompt = [
  'You extract assessment questions into structured JSON.',
  'Return ONLY valid JSON that matches the required schema.',
  'Extract optional assessmentMeta.title, assessmentMeta.subject, and assessmentMeta.grade when present.',
  'For multiple-choice questions, put answer options only in choices and keep prompt as the question stem only.',
  'Do not include option labels like A/B/C/D, a/b/c/d, or ア/イ/ウ/エ in prompt text.',
  'Ignore page headers, footers, navigation links, and product boilerplate text.',
  'Ignore explanation/answer sections such as 解説, 解答, 解答欄, answer key, and worked examples.',
  'If metadata is not clearly present, return null for those assessmentMeta fields.',
  'Question types must be one of: multiple_choice, true_false, short_answer, written, other.',
  'Use choices as an array of strings for multiple choice; use null for non-choice questions.',
  'correctAnswer must include both label and text when possible; use nulls when unknown.',
  'points must be an integer or null.',
  'orderIndex must be 1-based and sequential.',
].join(' ');

const generationSystemPrompt = [
  'You generate a single assessment question in structured JSON.',
  'Return ONLY valid JSON that matches the required schema.',
  'Question types must be one of: multiple_choice, true_false, short_answer, written, other.',
  'Use choices as an array of strings for multiple choice; use null for non-choice questions.',
  'correctAnswer must include both label and text when possible; use nulls when unknown.',
  'points must be an integer or null.',
  'orderIndex must be 1-based and sequential.',
].join(' ');

const normalizeAssessmentMeta = (input: unknown): AssessmentMeta | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const value = input as { title?: unknown; subject?: unknown; grade?: unknown };
  const normalize = (raw: unknown) => {
    if (typeof raw !== 'string') {
      return null;
    }

    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  };

  return {
    title: normalize(value.title),
    subject: normalize(value.subject),
    grade: normalize(value.grade),
  };
};

const extractOutputText = (json: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}) => {
  if (typeof json.output_text === 'string' && json.output_text.trim()) {
    return json.output_text;
  }

  const output = Array.isArray(json.output) ? json.output : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    const textBlock = content.find((block) => block.type === 'output_text' && block.text);
    if (textBlock?.text) {
      return textBlock.text;
    }
  }

  return '';
};

const getOpenAiRequestId = (response: Response) =>
  response.headers.get('x-request-id') ?? response.headers.get('openai-request-id');

export const parseWithOpenAiDetailed = async (input: {
  text: string;
  model: string;
}): Promise<LlmParseResult> => {
  if (!workerEnv.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const llmStart = performance.now();
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerEnv.openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'questions_extract',
          schema: questionsJsonSchema,
          strict: true,
        },
      },
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Extract assessment questions from this text.\n\nText:\n${input.text}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const json = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
  };

  const outputText = extractOutputText(json);
  if (!outputText) {
    throw new Error('OpenAI response was empty');
  }

  const parsed = JSON.parse(outputText) as {
    questions?: ParsedQuestion[];
    assessmentMeta?: AssessmentMeta | null;
  };
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

  if (questions.length === 0) {
    throw new Error('OpenAI returned no questions');
  }

  const llmCallMs = Math.round(performance.now() - llmStart);
  const providerRequestId = getOpenAiRequestId(response);

  return {
    questions,
    assessmentMeta: normalizeAssessmentMeta(parsed.assessmentMeta),
    usage: json.usage
      ? {
          inputTokens: json.usage.input_tokens,
          outputTokens: json.usage.output_tokens,
          totalTokens: json.usage.total_tokens,
        }
      : undefined,
    diagnostics: {
      llmCallMs,
      providerRequestId,
    },
  };
};

export const parseWithOpenAiFileDetailed = async (input: {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  model: string;
}): Promise<LlmParseResult> => {
  if (!workerEnv.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const llmStart = performance.now();
  const uploadStart = performance.now();
  const uploadForm = new FormData();
  uploadForm.append('purpose', 'assistants');
  uploadForm.append('expires_after[anchor]', 'created_at');
  uploadForm.append('expires_after[seconds]', '86400');
  uploadForm.append(
    'file',
    new Blob([Uint8Array.from(input.fileBuffer)], { type: input.mimeType }),
    input.fileName,
  );

  const uploadResponse = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerEnv.openAiApiKey}`,
    },
    body: uploadForm,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`OpenAI file upload failed: ${uploadResponse.status} ${errorText}`);
  }

  const uploadJson = (await uploadResponse.json()) as { id?: string };
  const openaiFileUploadMs = Math.round(performance.now() - uploadStart);
  const fileId = uploadJson?.id;
  if (!fileId) {
    throw new Error('OpenAI file upload response missing file id');
  }

  try {
    const responsesStart = performance.now();
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${workerEnv.openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'questions_extract',
            schema: questionsJsonSchema,
            strict: true,
          },
        },
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Extract assessment questions from this document.',
              },
              {
                type: 'input_file',
                file_id: fileId,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
    }

    const openaiResponsesMs = Math.round(performance.now() - responsesStart);

    const json = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      };
    };

    const outputText = extractOutputText(json);
    if (!outputText) {
      throw new Error('OpenAI response was empty');
    }

    const parsed = JSON.parse(outputText) as {
      questions?: ParsedQuestion[];
      assessmentMeta?: AssessmentMeta | null;
    };
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

    if (questions.length === 0) {
      throw new Error('OpenAI returned no questions');
    }

    const llmCallMs = Math.round(performance.now() - llmStart);
    const providerRequestId = getOpenAiRequestId(response);

    return {
      questions,
      assessmentMeta: normalizeAssessmentMeta(parsed.assessmentMeta),
      usage: json.usage
        ? {
            inputTokens: json.usage.input_tokens,
            outputTokens: json.usage.output_tokens,
            totalTokens: json.usage.total_tokens,
          }
        : undefined,
      diagnostics: {
        llmCallMs,
        providerRequestId,
        openaiFileUploadMs,
        openaiResponsesMs,
      },
    };
  } finally {
    try {
      const deleteResponse = await fetch(
        `https://api.openai.com/v1/files/${encodeURIComponent(fileId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${workerEnv.openAiApiKey}` },
        },
      );
      if (!deleteResponse.ok) {
        console.error('failed to delete temporary OpenAI file', { status: deleteResponse.status });
      }
    } catch (error) {
      console.error('failed to delete temporary OpenAI file', error);
    }
  }
};

export const parseWithOpenAi = async (input: {
  text: string;
  model: string;
}): Promise<ParsedQuestion[]> => {
  const result = await parseWithOpenAiDetailed(input);
  return result.questions;
};

export const generateWithOpenAiDetailed = async (input: {
  prompt: string;
  model: string;
}): Promise<LlmParseResult> => {
  if (!workerEnv.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const llmStart = performance.now();
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerEnv.openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'question_generate',
          schema: questionGenerationJsonSchema,
          strict: true,
        },
      },
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: generationSystemPrompt }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: input.prompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const json = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
  };

  const outputText = extractOutputText(json);
  if (!outputText) {
    throw new Error('OpenAI response was empty');
  }

  const parsed = JSON.parse(outputText) as {
    questions?: ParsedQuestion[];
    assessmentMeta?: AssessmentMeta | null;
  };
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

  if (questions.length === 0) {
    throw new Error('OpenAI returned no questions');
  }

  const llmCallMs = Math.round(performance.now() - llmStart);
  const providerRequestId = getOpenAiRequestId(response);

  return {
    questions,
    usage: json.usage
      ? {
          inputTokens: json.usage.input_tokens,
          outputTokens: json.usage.output_tokens,
          totalTokens: json.usage.total_tokens,
        }
      : undefined,
    diagnostics: {
      llmCallMs,
      providerRequestId,
    },
  };
};
