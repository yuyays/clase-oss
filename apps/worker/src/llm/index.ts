import { workerEnv } from '@clase/shared/server';

import {
  generateWithAnthropicDetailed,
  parseWithAnthropic,
  parseWithAnthropicDetailed,
} from './anthropic.js';
import {
  generateWithOpenAiDetailed,
  parseWithOpenAi,
  parseWithOpenAiDetailed,
  parseWithOpenAiFileDetailed,
} from './openai.js';
import type { LlmParseResult } from './types.js';

export const parseQuestionsWithLlm = async (input: { text: string }) => {
  const provider = workerEnv.llmProvider;
  const model = workerEnv.llmModel;

  if (provider === 'anthropic') {
    return parseWithAnthropic({ text: input.text, model });
  }

  return parseWithOpenAi({ text: input.text, model });
};

export const parseQuestionsWithLlmDetailed = async (input: {
  text: string;
}): Promise<LlmParseResult> => {
  const provider = workerEnv.llmProvider;
  const model = workerEnv.llmModel;

  if (provider === 'anthropic') {
    return parseWithAnthropicDetailed({ text: input.text, model });
  }

  return parseWithOpenAiDetailed({ text: input.text, model });
};

export const parseQuestionsWithLlmFileDetailed = async (input: {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<LlmParseResult> => {
  const provider = workerEnv.llmProvider;
  const model = workerEnv.llmModel;

  if (provider === 'anthropic') {
    throw new Error('Anthropic file parsing is not supported');
  }

  return parseWithOpenAiFileDetailed({
    fileBuffer: input.fileBuffer,
    fileName: input.fileName,
    mimeType: input.mimeType,
    model,
  });
};

export const generateQuestionWithLlmDetailed = async (input: {
  prompt: string;
}): Promise<LlmParseResult> => {
  const provider = workerEnv.llmProvider;
  const model = workerEnv.llmModel;

  if (provider === 'anthropic') {
    return generateWithAnthropicDetailed({ prompt: input.prompt, model });
  }

  return generateWithOpenAiDetailed({ prompt: input.prompt, model });
};
