import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  LLM_MODE: z.enum(['chunk', 'truncate']).optional().default('chunk'),
  LLM_CHUNK_SIZE: z.string().optional(),
  LLM_PROVIDER: z.string().optional().default('openai'),
  LLM_MODEL: z.string().optional().default('gpt-5-nano-2025-08-07'),
  LLM_MAX_CHARS: z.string().optional(),
  PARSING_CONCURRENCY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const message = Object.entries(errors)
    .map(([key, value]) => `${key}: ${value?.join(', ') ?? 'invalid'}`)
    .join('; ');

  throw new Error(`Invalid environment variables: ${message}`);
}

export const env = {
  llmMode: parsed.data.LLM_MODE,
  llmChunkSize: parsed.data.LLM_CHUNK_SIZE ? Number(parsed.data.LLM_CHUNK_SIZE) : undefined,
  llmProvider: parsed.data.LLM_PROVIDER,
  llmModel: parsed.data.LLM_MODEL,
  llmMaxChars: parsed.data.LLM_MAX_CHARS ? Number(parsed.data.LLM_MAX_CHARS) : undefined,
  parsingConcurrency: parsed.data.PARSING_CONCURRENCY
    ? Number(parsed.data.PARSING_CONCURRENCY)
    : undefined,
  openAiApiKey: parsed.data.OPENAI_API_KEY,
  anthropicApiKey: parsed.data.ANTHROPIC_API_KEY,
};
