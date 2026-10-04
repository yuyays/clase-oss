import { workerEnv } from '@clase/shared/server';

import type { AssessmentMeta, LlmParseResult, ParsedQuestion } from './types.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

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

export const parseWithAnthropicDetailed = async (input: {
  text: string;
  model: string;
}): Promise<LlmParseResult> => {
  if (!workerEnv.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': workerEnv.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content:
            'Return ONLY valid JSON with shape {"assessmentMeta":{"title":null,"subject":null,"grade":null},"questions": [{"type":"written","prompt":"...","choices":[],"correctAnswer":{"label":null,"text":null},"points":null,"orderIndex":1}]}. ' +
            'Use types: multiple_choice, true_false, short_answer, written, other. ' +
            'Extract assessmentMeta.title, assessmentMeta.subject, and assessmentMeta.grade when present. ' +
            'For multiple-choice questions, keep prompt as the stem only and put options in choices. ' +
            'Do not include option labels like A/B/C/D, a/b/c/d, or ア/イ/ウ/エ in prompt text. ' +
            'Ignore page headers, footers, navigation links, and product boilerplate text. ' +
            'Ignore explanation/answer sections such as 解説, 解答, 解答欄, answer key, and worked examples. ' +
            'If metadata is not clearly present, return null for those assessmentMeta fields. ' +
            'Use choices as an array of strings for multiple choice; use null for non-choice questions. ' +
            'correctAnswer must include both label and text when possible; use nulls when unknown. ' +
            'points must be an integer or null. orderIndex must be 1-based and sequential. ' +
            'Ignore page headers/footers or markers like "-- 3 of 10 --". ' +
            'If you cannot find questions, return {"assessmentMeta":{"title":null,"subject":null,"grade":null},"questions": []}.' +
            `\n\nText:\n${input.text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic request failed: ${response.status} ${errorText}`);
  }

  const json = (await response.json()) as {
    content?: Array<{ text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };

  const content = json.content?.[0]?.text ?? '';

  if (!content) {
    throw new Error('Anthropic response was empty');
  }

  const parsed = JSON.parse(content) as {
    questions?: ParsedQuestion[];
    assessmentMeta?: AssessmentMeta | null;
  };
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

  if (questions.length === 0) {
    throw new Error('Anthropic returned no questions');
  }

  return {
    questions,
    assessmentMeta: normalizeAssessmentMeta(parsed.assessmentMeta),
    usage: json.usage
      ? {
          inputTokens: json.usage.input_tokens,
          outputTokens: json.usage.output_tokens,
          totalTokens:
            json.usage.input_tokens && json.usage.output_tokens
              ? json.usage.input_tokens + json.usage.output_tokens
              : undefined,
        }
      : undefined,
  };
};

export const parseWithAnthropic = async (input: {
  text: string;
  model: string;
}): Promise<ParsedQuestion[]> => {
  const result = await parseWithAnthropicDetailed(input);
  return result.questions;
};

export const generateWithAnthropicDetailed = async (input: {
  prompt: string;
  model: string;
}): Promise<LlmParseResult> => {
  if (!workerEnv.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': workerEnv.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content:
            'Return ONLY valid JSON with shape {"questions": [{"type":"written","prompt":"...","choices":[],"correctAnswer":{"label":null,"text":null},"points":null,"orderIndex":1}]}. ' +
            'Use types: multiple_choice, true_false, short_answer, written, other. ' +
            'Use choices as an array of strings for multiple choice; use null for non-choice questions. ' +
            'correctAnswer must include both label and text when possible; use nulls when unknown. ' +
            'points must be an integer or null. orderIndex must be 1-based and sequential. ' +
            input.prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic request failed: ${response.status} ${errorText}`);
  }

  const json = (await response.json()) as {
    content?: Array<{ text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };

  const content = json.content?.[0]?.text ?? '';

  if (!content) {
    throw new Error('Anthropic response was empty');
  }

  const parsed = JSON.parse(content) as { questions?: ParsedQuestion[] };
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

  if (questions.length === 0) {
    throw new Error('Anthropic returned no questions');
  }

  return {
    questions,
    usage: json.usage
      ? {
          inputTokens: json.usage.input_tokens,
          outputTokens: json.usage.output_tokens,
          totalTokens:
            json.usage.input_tokens && json.usage.output_tokens
              ? json.usage.input_tokens + json.usage.output_tokens
              : undefined,
        }
      : undefined,
  };
};
