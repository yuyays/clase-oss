import 'dotenv/config';

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { Worker } from 'bullmq';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import pino from 'pino';

import { questionPayloadSchema } from '@clase/shared';
import {
  assessments,
  assessmentVersions,
  assetFiles,
  db,
  parsingJobs,
  questionGenerationJobs,
  questions,
  workerEnv,
} from '@clase/shared/server';
import {
  generateQuestionWithLlmDetailed,
  parseQuestionsWithLlmDetailed,
  parseQuestionsWithLlmFileDetailed,
} from './llm/index.js';
import type { AssessmentMeta, ParsedQuestion } from './llm/types.js';
import { storageBucket, supabase } from './lib/supabase.js';

const enablePretty = process.env.LOG_PRETTY === 'true' || process.env.LOG_PRETTY === '1';

const logger = pino(
  enablePretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        },
      }
    : undefined,
);
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const parsingConcurrency = Math.max(1, workerEnv.parsingConcurrency ?? 2);

const pageMarkerRegex = /^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/i;
const pageFractionRegex = /^\s*\d+\s*\/\s*\d+\s*$/;
const bracketOnlyLineRegex = /^\[[^\]]+\]$/;
const japaneseSectionTitleRegex = /^【[^】]+】$/;

const getFileNameFromStorageUrl = (storageUrl: string) => {
  const fileName = storageUrl.split('/').pop() ?? null;
  if (!fileName) {
    return null;
  }

  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
};

const splitQuestions = (rawText: string) => {
  const lines = rawText.split(/\r?\n/);
  const questions: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) {
      questions.push(text);
    }
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || pageMarkerRegex.test(trimmed) || pageFractionRegex.test(trimmed)) {
      flush();
      continue;
    }

    const numberedMatch = trimmed.match(/^\s*\d+[\).]\s+(.*)$/);
    if (numberedMatch?.[1] !== undefined) {
      flush();
      buffer.push(numberedMatch[1].trim());
      continue;
    }

    buffer.push(trimmed);
  }

  flush();

  return questions;
};

const parseAssetText = async (input: { assetFileId: string; mimeType: string; buffer: Buffer }) => {
  if (input.mimeType === 'application/pdf') {
    const pdfParseStart = performance.now();
    const parser = new PDFParse({ data: input.buffer });
    const parsed = await parser.getText();
    const pdfParseDurationMs = Math.round(performance.now() - pdfParseStart);

    return { text: parsed.text, parser: 'pdf', pdfParseDurationMs } as const;
  }

  if (
    input.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const parsed = await mammoth.extractRawText({ buffer: input.buffer });
    return { text: parsed.value, parser: 'docx' } as const;
  }

  if (input.mimeType === 'image/jpeg' || input.mimeType === 'image/png') {
    throw new Error('Image parsing is not supported without OCR');
  }

  throw new Error('Unsupported file type for parsing');
};

type NormalizedQuestion = {
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'written' | 'other';
  prompt: string;
  choices: string[] | null;
  correctAnswer: { label: string | null; text: string | null };
  points: number | null;
  orderIndex: number;
};

const QUESTION_TYPES = new Set<NormalizedQuestion['type']>([
  'multiple_choice',
  'true_false',
  'short_answer',
  'written',
  'other',
]);

const normalizeQuestion = (item: ParsedQuestion, index: number): NormalizedQuestion | null => {
  const type = QUESTION_TYPES.has(item.type) ? item.type : 'written';
  const isChoice = type === 'multiple_choice' || type === 'true_false';
  const choices = isChoice
    ? Array.isArray(item.choices)
      ? item.choices
          .filter((choice) => typeof choice === 'string')
          .map((choice) => choice.trim())
          .filter(Boolean)
      : []
    : null;
  const prompt =
    typeof item.prompt === 'string' ? stripChoiceArtifactsFromPrompt(item.prompt, choices) : '';
  if (!prompt) return null;

  let correctAnswer = { label: null, text: null } as { label: string | null; text: string | null };
  if (item.correctAnswer && typeof item.correctAnswer === 'object') {
    const value = item.correctAnswer as { label?: string | null; text?: string | null };
    correctAnswer = {
      label: value.label ?? null,
      text: value.text ?? null,
    };
  } else if (typeof item.correctAnswer === 'string') {
    correctAnswer = { label: item.correctAnswer, text: null };
  }

  const points =
    typeof item.points === 'number' && Number.isFinite(item.points)
      ? Math.trunc(item.points)
      : null;

  return {
    type,
    prompt,
    choices,
    correctAnswer,
    points,
    orderIndex: index + 1,
  };
};

const normalizeQuestions = (items: ParsedQuestion[]) =>
  items
    .map((item, index) => normalizeQuestion(item, index))
    .filter((item): item is NormalizedQuestion => Boolean(item));

type ParseConfidence = {
  pass: boolean;
  reason: string;
  parsedCount: number;
  normalizedCount: number;
  validCount: number;
  validRatio: number;
};

const MIN_CONFIDENT_QUESTIONS = 1;
const MIN_CONFIDENT_VALID_RATIO = 0.8;
const MIN_TEXT_ATTEMPT_CHARS = 200;
const MIN_TEXT_SIGNAL_RATIO = 0.35;
const MIN_PROMPT_CHARS = 16;
const MIN_QUESTION_COUNT_GUARD = 22;
const QUESTION_COUNT_GUARD_DIVISOR = 1200;
const TEXT_CHUNK_OVERLAP_CHARS = 300;
const LLM_CHUNK_EXECUTION_CONCURRENCY = 2;
const ENABLE_LLM_CHUNK_EXECUTION = false;

const scoreTextSignalRatio = (input: string) => {
  const compact = input.replace(/\s+/g, '');
  if (!compact) {
    return 0;
  }

  const informativeChars = compact.match(/[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]/g)?.length ?? 0;
  return informativeChars / compact.length;
};

const evaluateParseConfidence = (items: ParsedQuestion[]): ParseConfidence => {
  const normalized = normalizeQuestions(items);
  const validCount = normalized.filter(
    (item) => questionPayloadSchema.safeParse(item).success,
  ).length;
  const normalizedCount = normalized.length;
  const validRatio = normalizedCount > 0 ? validCount / normalizedCount : 0;

  if (normalizedCount < MIN_CONFIDENT_QUESTIONS) {
    return {
      pass: false,
      reason: 'insufficient_questions',
      parsedCount: items.length,
      normalizedCount,
      validCount,
      validRatio,
    };
  }

  if (validRatio < MIN_CONFIDENT_VALID_RATIO) {
    return {
      pass: false,
      reason: 'low_valid_ratio',
      parsedCount: items.length,
      normalizedCount,
      validCount,
      validRatio,
    };
  }

  return {
    pass: true,
    reason: 'ok',
    parsedCount: items.length,
    normalizedCount,
    validCount,
    validRatio,
  };
};

type TextChunk = {
  index: number;
  start: number;
  end: number;
  text: string;
};

const buildTextChunks = (input: string, size: number, overlap: number): TextChunk[] => {
  if (!input) {
    return [];
  }

  const chunkSize = Math.max(1000, size);
  const chunkOverlap = Math.min(Math.max(0, overlap), chunkSize - 1);
  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < input.length) {
    const end = Math.min(input.length, start + chunkSize);
    chunks.push({
      index,
      start,
      end,
      text: input.slice(start, end),
    });

    if (end >= input.length) {
      break;
    }

    start = Math.max(end - chunkOverlap, start + 1);
    index += 1;
  }

  return chunks;
};

const getUsageValue = (value: number | undefined) => (typeof value === 'number' ? value : 0);

const hasQuestionSignal = (input: string) => /[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]/.test(input);
const questionMarkerRegex =
  /[?？]|\b(which|what|how|why|select|choose|answer|find|solve)\b|問|問題|答え|選べ|求め/i;
const headingLikeRegex =
  /^(name|名前|title|題|章|section|unit|lesson|free|無料|http|www\.|page\s*\d+|\d+\s*\/\s*\d+)$/i;

const instructionOnlyRegex =
  /(次の.*(答え|選|書)|answer|choose|select|write|fill in|instructions?|注意|解答|記入)/i;

const choiceMarkerRegex = /(^|\n|\s)([\(\[]?[A-Da-d][\)\].:：\-]|[ア-エ][\)\].:：\-]?)(?=\s+)/g;
const MIN_STEM_CHARS_FOR_CHOICE_TRIM = 8;

const stripChoiceArtifactsFromPrompt = (prompt: string, choices: string[] | null) => {
  if (!Array.isArray(choices) || choices.length < 2) {
    return prompt.trim();
  }

  const normalized = prompt.trim();
  if (!normalized) {
    return normalized;
  }

  choiceMarkerRegex.lastIndex = 0;
  const markers: number[] = [];
  let match = choiceMarkerRegex.exec(normalized);
  while (match) {
    const prefix = match[1] ?? '';
    const markerIndex = match.index + prefix.length;
    markers.push(markerIndex);
    match = choiceMarkerRegex.exec(normalized);
  }

  choiceMarkerRegex.lastIndex = 0;

  if (markers.length < 2) {
    return normalized;
  }

  const firstMarker = markers[0] ?? -1;
  if (firstMarker <= 0) {
    return normalized;
  }

  const candidate = normalized.slice(0, firstMarker).trim();
  if (candidate.length < MIN_STEM_CHARS_FOR_CHOICE_TRIM) {
    return normalized;
  }

  return candidate;
};

const normalizePromptForDedupe = (prompt: string) =>
  prompt
    .toLowerCase()
    .replace(/^\s*(?:q\s*)?(?:問|問題)?\s*[0-9０-９]+[\).:：\-\s]*/i, '')
    .replace(/^\s*[\(\[]?[a-z0-9][\)\].:：\-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const hasQuestionMarker = (prompt: string) => questionMarkerRegex.test(prompt);

const scoreParsedQuestionRichness = (question: ParsedQuestion) => {
  let score = (question.prompt?.trim().length ?? 0) * 2;
  if (Array.isArray(question.choices) && question.choices.length > 0) {
    score += 200 + question.choices.length * 10;
  }
  if (question.correctAnswer && typeof question.correctAnswer === 'object') {
    if (question.correctAnswer.label || question.correctAnswer.text) {
      score += 120;
    }
  }
  if (typeof question.points === 'number') {
    score += 20;
  }
  return score;
};

const isLowSignalQuestion = (question: ParsedQuestion) => {
  const prompt = question.prompt?.trim() ?? '';
  if (!prompt) {
    return true;
  }

  if (prompt.length < MIN_PROMPT_CHARS) {
    return true;
  }

  if (!hasQuestionSignal(prompt)) {
    return true;
  }

  const compact = prompt.replace(/\s+/g, ' ').trim();
  const hasChoices = Array.isArray(question.choices) && question.choices.length >= 2;
  const hasAnswer =
    Boolean(question.correctAnswer && typeof question.correctAnswer === 'object') &&
    Boolean(question.correctAnswer?.label || question.correctAnswer?.text);
  const markedAsQuestion = hasQuestionMarker(compact);

  if (headingLikeRegex.test(compact) && !markedAsQuestion && !hasChoices && !hasAnswer) {
    return true;
  }

  if (instructionOnlyRegex.test(compact) && !markedAsQuestion && !hasChoices && !hasAnswer) {
    return true;
  }

  if (!markedAsQuestion && !hasChoices && !hasAnswer && compact.length < 24) {
    return true;
  }

  return false;
};

const hasChoices = (question: ParsedQuestion) =>
  Array.isArray(question.choices) && question.choices.length > 0;

const hasCorrectAnswer = (question: ParsedQuestion) => {
  if (!question.correctAnswer || typeof question.correctAnswer !== 'object') {
    return false;
  }

  return Boolean(question.correctAnswer.label || question.correctAnswer.text);
};

const shouldMergeQuestionFragments = (current: ParsedQuestion, next: ParsedQuestion) => {
  if (hasChoices(current) || hasChoices(next)) {
    return false;
  }

  if (hasCorrectAnswer(current) || hasCorrectAnswer(next)) {
    return false;
  }

  const currentPrompt = current.prompt.trim();
  const nextPrompt = next.prompt.trim();

  if (!currentPrompt || !nextPrompt) {
    return false;
  }

  if (currentPrompt.length > 80 || nextPrompt.length > 80) {
    return false;
  }

  const currentLooksIncomplete =
    !/[.!?。！？]$/.test(currentPrompt) || /[:：\-（(]$/.test(currentPrompt);
  const nextLooksContinuation =
    /^[a-z0-9\-\),.:;\]]/.test(nextPrompt) ||
    /^(and|or|with|for|について|または|および)/i.test(nextPrompt);

  return currentLooksIncomplete && nextLooksContinuation;
};

const mergeQuestionPair = (current: ParsedQuestion, next: ParsedQuestion): ParsedQuestion => ({
  ...current,
  prompt: `${current.prompt.trim()} ${next.prompt.trim()}`.replace(/\s+/g, ' ').trim(),
  type: current.type === 'written' ? (next.type ?? current.type) : current.type,
  choices: current.choices ?? next.choices,
  correctAnswer: current.correctAnswer ?? next.correctAnswer,
  points: current.points ?? next.points,
  orderIndex: current.orderIndex ?? next.orderIndex,
});

const buildPromptShingles = (prompt: string) => {
  const normalized = normalizePromptForDedupe(prompt).replace(/\s+/g, '');
  if (!normalized) {
    return new Set<string>();
  }

  if (normalized.length <= 3) {
    return new Set([normalized]);
  }

  const shingles = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i += 1) {
    shingles.add(normalized.slice(i, i + 3));
  }
  return shingles;
};

const jaccardSimilarity = (left: Set<string>, right: Set<string>) => {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
};

const dedupeParsedQuestions = (items: ParsedQuestion[]) => {
  const exact = new Map<string, { question: ParsedQuestion; score: number; index: number }>();

  items.forEach((question, index) => {
    const key = normalizePromptForDedupe(question.prompt ?? '');
    if (!key) {
      return;
    }

    const score = scoreParsedQuestionRichness(question);
    const existing = exact.get(key);
    if (!existing || score > existing.score) {
      exact.set(key, { question, score, index: existing?.index ?? index });
    }
  });

  const exactDeduped = [...exact.values()]
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.question);
  const dedupeExactDroppedCount = items.length - exactDeduped.length;

  const fuzzy: Array<{ question: ParsedQuestion; score: number; shingles: Set<string> }> = [];
  let dedupeFuzzyDroppedCount = 0;

  for (const question of exactDeduped) {
    const candidate = {
      question,
      score: scoreParsedQuestionRichness(question),
      shingles: buildPromptShingles(question.prompt ?? ''),
    };

    let duplicateIndex = -1;
    for (let i = 0; i < fuzzy.length; i += 1) {
      const similarity = jaccardSimilarity(
        candidate.shingles,
        fuzzy[i]?.shingles ?? new Set<string>(),
      );
      if (similarity >= 0.9) {
        duplicateIndex = i;
        break;
      }
    }

    if (duplicateIndex === -1) {
      fuzzy.push(candidate);
      continue;
    }

    dedupeFuzzyDroppedCount += 1;
    if (candidate.score > (fuzzy[duplicateIndex]?.score ?? 0)) {
      fuzzy[duplicateIndex] = candidate;
    }
  }

  return {
    questions: fuzzy.map((entry, index) => ({
      ...entry.question,
      orderIndex: index + 1,
    })),
    dedupeExactDroppedCount,
    dedupeFuzzyDroppedCount,
  };
};

const stabilizeParsedQuestions = (items: ParsedQuestion[]) => {
  const preFilterCount = items.length;
  const filtered = items.filter((item) => !isLowSignalQuestion(item));
  const merged: ParsedQuestion[] = [];
  let mergedFragmentCount = 0;

  for (const item of filtered) {
    const previous = merged.length > 0 ? merged[merged.length - 1] : undefined;
    if (previous && shouldMergeQuestionFragments(previous, item)) {
      merged[merged.length - 1] = mergeQuestionPair(previous, item);
      mergedFragmentCount += 1;
      continue;
    }

    merged.push(item);
  }

  return {
    questions: merged,
    preFilterCount,
    postFilterCount: merged.length,
    questionnessDroppedCount: preFilterCount - filtered.length,
    mergedFragmentCount,
  };
};

const isSuspiciousQuestionCount = (questionCount: number, rawTextLength: number) => {
  const threshold = Math.max(
    MIN_QUESTION_COUNT_GUARD,
    Math.floor(rawTextLength / QUESTION_COUNT_GUARD_DIVISOR),
  );
  return {
    suspicious: questionCount > threshold,
    threshold,
  };
};

const scoreQuestionRichness = (question: NormalizedQuestion) => {
  let score = question.prompt.length;

  if (Array.isArray(question.choices) && question.choices.length > 0) {
    score += 200;
  }

  if (question.correctAnswer.label || question.correctAnswer.text) {
    score += 100;
  }

  if (typeof question.points === 'number') {
    score += 20;
  }

  return score;
};

const mergeChunkResults = (items: ParsedQuestion[]) => {
  const normalized = normalizeQuestions(items);
  const deduped = new Map<
    string,
    { item: NormalizedQuestion; score: number; firstIndex: number }
  >();

  normalized.forEach((item, index) => {
    const fingerprint = createHash('sha256')
      .update(item.prompt.replace(/\s+/g, ' ').trim().toLowerCase())
      .digest('hex');
    const score = scoreQuestionRichness(item);
    const existing = deduped.get(fingerprint);

    if (!existing) {
      deduped.set(fingerprint, { item, score, firstIndex: index });
      return;
    }

    if (score > existing.score) {
      deduped.set(fingerprint, { item, score, firstIndex: existing.firstIndex });
    }
  });

  const merged = [...deduped.values()]
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((entry, index) => ({
      ...entry.item,
      orderIndex: index + 1,
    }));

  return {
    questions: merged as ParsedQuestion[],
    dedupedCount: normalized.length - merged.length,
    finalCount: merged.length,
  };
};

const parseTextChunksDetailed = async (input: { chunks: TextChunk[]; concurrency: number }) => {
  const durations = Array.from({ length: input.chunks.length }, () => 0);
  const chunkResults = Array.from({ length: input.chunks.length }, () => [] as ParsedQuestion[]);
  const errors: string[] = [];
  let usageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  const workerCount = Math.max(1, Math.min(input.concurrency, input.chunks.length));
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < input.chunks.length) {
      const current = cursor;
      cursor += 1;
      const chunk = input.chunks[current];
      if (!chunk) {
        continue;
      }

      const chunkStart = performance.now();
      try {
        const response = await parseQuestionsWithLlmDetailed({ text: chunk.text });
        durations[current] = Math.round(performance.now() - chunkStart);
        chunkResults[current] = response.questions;
        usageTotals = {
          inputTokens: usageTotals.inputTokens + getUsageValue(response.usage?.inputTokens),
          outputTokens: usageTotals.outputTokens + getUsageValue(response.usage?.outputTokens),
          totalTokens: usageTotals.totalTokens + getUsageValue(response.usage?.totalTokens),
        };
      } catch (error) {
        durations[current] = Math.round(performance.now() - chunkStart);
        errors.push(error instanceof Error ? error.message : 'chunk parse error');
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  if (
    usageTotals.inputTokens === 0 &&
    usageTotals.outputTokens === 0 &&
    usageTotals.totalTokens === 0
  ) {
    usageTotals = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
  }

  return {
    questions: chunkResults.flat(),
    usageTotals,
    durations,
    errors,
    workerCount,
  };
};

const answerKeyHeaderRegex = /^\s*(answers?|answer key|解答|答え)\b/i;
const answerLineRegex = /^\s*(\d{1,3})[\).:-]?\s*([A-Za-z]|true|false|[0-9]+)\s*$/i;

const sanitizeText = (input: string) =>
  input
    .replace(/\t+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

const normalizeMetadataValue = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeTitleForComparison = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,6}$/gi, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const genericTitleRegex =
  /^(untitled(?: assessment)?|new assessment|new|draft|document|worksheet|file|無題(?:の課題)?|新規|下書き|ドキュメント|ワークシート)$/i;

const isLikelyFilenameSlug = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (/\.(pdf|docx?|pptx?|xlsx?)$/i.test(trimmed)) {
    return true;
  }

  if (!/^[a-zA-Z0-9._\- ]+$/.test(trimmed)) {
    return false;
  }

  const tokens = trimmed.split(/[._\-\s]+/).filter(Boolean);
  if (tokens.length < 2) {
    return false;
  }

  const hasNoiseToken = tokens.some((token) => {
    const normalized = token.toLowerCase();
    return (
      /^\d{4,}$/.test(normalized) || /^(v\d+|ver\d+|rev\d+|copy|final|draft)$/i.test(normalized)
    );
  });

  return hasNoiseToken;
};

const isPlaceholderTitle = (
  currentTitle: string | null | undefined,
  fileBaseTitle: string | null,
) => {
  if (typeof currentTitle !== 'string') {
    return true;
  }

  const trimmed = currentTitle.trim();
  if (!trimmed) {
    return true;
  }

  if (genericTitleRegex.test(trimmed)) {
    return true;
  }

  const normalizedCurrent = normalizeTitleForComparison(trimmed);
  const normalizedFileBase = normalizeTitleForComparison(fileBaseTitle);
  if (normalizedCurrent && normalizedFileBase && normalizedCurrent === normalizedFileBase) {
    return true;
  }

  return isLikelyFilenameSlug(trimmed);
};

const isValidMetadataTitle = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.length < 3 || trimmed.length > 80) {
    return false;
  }

  if (genericTitleRegex.test(trimmed)) {
    return false;
  }

  if (/(https?:\/\/|www\.)/i.test(trimmed)) {
    return false;
  }

  if (!/[\p{L}]/u.test(trimmed)) {
    return false;
  }

  const symbolCount = (trimmed.match(/[^\p{L}\p{N}\s]/gu) ?? []).length;
  return symbolCount < Math.max(3, Math.floor(trimmed.length / 2));
};

const normalizeAssessmentMeta = (meta: AssessmentMeta | null | undefined) => {
  if (!meta) {
    return null;
  }

  return {
    title: normalizeMetadataValue(meta.title),
    subject: normalizeMetadataValue(meta.subject),
    grade: normalizeMetadataValue(meta.grade),
  };
};

const hasTextValue = (value: string | null | undefined) =>
  typeof value === 'string' && value.trim().length > 0;

const mergeAssessmentMeta = (
  primary: AssessmentMeta | null | undefined,
  fallback: AssessmentMeta | null | undefined,
): AssessmentMeta | null => {
  const normalizedPrimary = normalizeAssessmentMeta(primary);
  const normalizedFallback = normalizeAssessmentMeta(fallback);

  if (!normalizedPrimary && !normalizedFallback) {
    return null;
  }

  return {
    title: normalizedPrimary?.title ?? normalizedFallback?.title ?? null,
    subject: normalizedPrimary?.subject ?? normalizedFallback?.subject ?? null,
    grade: normalizedPrimary?.grade ?? normalizedFallback?.grade ?? null,
  };
};

const inferAssessmentMetaFromRawText = (rawText: string): AssessmentMeta | null => {
  const normalizedText = rawText.replace(/\r/g, '');

  const titleMatch = normalizedText.match(/【\s*([^】]{2,120})\s*】/);
  const subjectMatch = normalizedText.match(
    /(理科|社会|数学|国語|英語|science|social studies|math(?:ematics)?|japanese|english)/i,
  );
  const gradeMatch = normalizedText.match(/(\d{1,2})\s*(?:年|grade|年生)|(?:grade)\s*(\d{1,2})/i);

  const normalizedSubject = subjectMatch?.[1]?.trim() ?? null;

  const gradeValue = gradeMatch?.[1] ?? gradeMatch?.[2] ?? null;

  return normalizeAssessmentMeta({
    title: titleMatch?.[1]?.trim() ?? null,
    subject: normalizedSubject,
    grade: gradeValue,
  });
};

const questionStartRegex = /^\s*(問\s*[0-9０-９]+|問\s*題|問題\s*[0-9０-９]+)/;
const instructionLineRegex = /注意|合図|解答|記入|ページ|調査\s*問題/;

const shouldSkipBoilerplateLine = (line: string) => {
  if (!line) {
    return true;
  }

  if (line.startsWith('※')) {
    return true;
  }

  if (bracketOnlyLineRegex.test(line)) {
    return !/(問題|問\s*[0-9０-９]|question)/i.test(line);
  }

  if (japaneseSectionTitleRegex.test(line)) {
    return !/(問題|問\s*[0-9０-９]|question)/i.test(line);
  }

  return false;
};

const isHardLlmFailure = (errorMessage: string | null) => {
  if (!errorMessage) {
    return false;
  }

  const normalized = errorMessage.toLowerCase();

  if (normalized.includes('returned no questions') || normalized.includes('response was empty')) {
    return false;
  }

  return (
    normalized.includes('request failed') ||
    normalized.includes('file upload failed') ||
    normalized.includes('invalid_json_schema') ||
    normalized.includes('invalid_request_error') ||
    normalized.includes('rate limit') ||
    normalized.includes('429') ||
    normalized.includes('5xx') ||
    normalized.includes('503') ||
    normalized.includes('401') ||
    normalized.includes('403')
  );
};

const trimToFirstQuestion = (input: string) => {
  const lines = input.split(/\r?\n/);
  const startIndex = lines.findIndex(
    (line) => questionStartRegex.test(line) && !instructionLineRegex.test(line),
  );

  if (startIndex === -1) {
    return input;
  }

  return lines.slice(startIndex).join('\n');
};

const cleanQuestionText = (input: string) => {
  const lines = input.split(/\r?\n/);
  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    if (shouldSkipBoilerplateLine(trimmed)) return false;
    if (instructionLineRegex.test(trimmed)) {
      return false;
    }
    if (pageMarkerRegex.test(trimmed) || pageFractionRegex.test(trimmed)) {
      return false;
    }
    if (/^[^A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]+$/.test(trimmed)) {
      return false;
    }
    return true;
  });

  return cleaned.join('\n');
};

const buildGenerationPrompt = (input: {
  style: 'rewrite' | 'similar';
  targetCorrectRate: number;
  assessment: {
    title: string;
    description: string | null;
    assessmentCategory: string | null;
    customCategoryLabel: string | null;
    subject: string | null;
    grade: string | null;
  };
  question: {
    type: string;
    prompt: string;
    choices: string[] | null;
    correctAnswer: { label: string | null; text: string | null };
    points: number | null;
  };
}) => {
  const categoryLabel = input.assessment.customCategoryLabel
    ? `${input.assessment.assessmentCategory ?? 'uncategorized'} (${input.assessment.customCategoryLabel})`
    : (input.assessment.assessmentCategory ?? 'uncategorized');

  return [
    'You are an expert teacher.',
    '',
    input.style === 'similar'
      ? `Create a similar but distinct variant of the question so a typical Grade ${input.assessment.grade ?? 'unspecified'} student in ${input.assessment.subject ?? 'unspecified'} answers correctly about ${input.targetCorrectRate}% of the time.`
      : `Rewrite the question so a typical Grade ${input.assessment.grade ?? 'unspecified'} student in ${input.assessment.subject ?? 'unspecified'} answers correctly about ${input.targetCorrectRate}% of the time.`,
    'Keep the same question type and number of choices. Keep points the same.',
    'Avoid ambiguity. Ensure exactly one correct answer.',
    '',
    'Assessment context:',
    `- Title: ${input.assessment.title}`,
    `- Description: ${input.assessment.description ?? ''}`,
    `- Category: ${categoryLabel}`,
    '',
    'Original question:',
    `- Type: ${input.question.type}`,
    `- Prompt: ${input.question.prompt}`,
    `- Choices: ${JSON.stringify(input.question.choices)}`,
    `- Correct answer: ${JSON.stringify(input.question.correctAnswer)}`,
    `- Points: ${input.question.points ?? 'null'}`,
    '',
    'Return JSON matching schema: {"questions": [{"type":"...","prompt":"...","choices":null|[],"correctAnswer":{"label":null,"text":null},"points":null,"orderIndex":1}]}',
  ].join('\n');
};

const extractAnswerKey = (rawText: string) => {
  const lines = rawText.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => answerKeyHeaderRegex.test(line));

  if (headerIndex === -1) {
    return { questionText: rawText, answerMap: new Map<number, string>(), found: false };
  }

  const questionLines = lines.slice(0, headerIndex);
  const answerLines = lines.slice(headerIndex + 1);
  const answerMap = new Map<number, string>();

  for (const line of answerLines) {
    const match = line.match(answerLineRegex);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      const index = Number(match[1]);
      if (!Number.isNaN(index)) {
        answerMap.set(index, match[2]);
      }
    }
  }

  return {
    questionText: questionLines.join('\n').trim(),
    answerMap,
    found: answerMap.size > 0,
  };
};

export const parsingWorker = new Worker(
  'parsing',
  async (job) => {
    const startedAt = Date.now();
    logger.info({ jobId: job.id, name: job.name }, 'received parsing job');

    const assetFileId = job.data?.assetFileId as string | undefined;

    if (!assetFileId) {
      logger.error({ jobId: job.id }, 'missing assetFileId');
      return;
    }

    const [parsingJob] = await db
      .select()
      .from(parsingJobs)
      .where(eq(parsingJobs.assetFileId, assetFileId))
      .orderBy(desc(parsingJobs.createdAt))
      .limit(1);

    if (!parsingJob) {
      logger.error({ jobId: job.id, assetFileId }, 'parsing job record not found');
      return;
    }

    const queueWaitMs = Math.max(0, startedAt - parsingJob.createdAt.getTime());
    let downloadMs: number | null = null;
    let extractMs: number | null = null;
    let llmMs: number | null = null;
    let normalizeValidateMs: number | null = null;
    let dbWriteMs: number | null = null;

    await db
      .update(parsingJobs)
      .set({ status: 'running', errorMessage: null, updatedAt: new Date() })
      .where(eq(parsingJobs.id, parsingJob.id));

    try {
      const [assetFile] = await db
        .select()
        .from(assetFiles)
        .where(eq(assetFiles.id, assetFileId))
        .limit(1);

      if (!assetFile) {
        await db
          .update(parsingJobs)
          .set({
            status: 'failed',
            errorMessage: 'asset file not found',
            updatedAt: new Date(),
          })
          .where(eq(parsingJobs.id, parsingJob.id));

        return;
      }

      const downloadStart = performance.now();
      const { data, error } = await supabase.storage
        .from(storageBucket)
        .download(assetFile.storageUrl);

      if (error || !data) {
        downloadMs = Math.round(performance.now() - downloadStart);
        await db
          .update(parsingJobs)
          .set({
            status: 'failed',
            errorMessage: 'failed to download asset',
            updatedAt: new Date(),
          })
          .where(eq(parsingJobs.id, parsingJob.id));

        return;
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      downloadMs = Math.round(performance.now() - downloadStart);

      const extractStart = performance.now();
      const parsed = await parseAssetText({
        assetFileId,
        mimeType: assetFile.mimeType,
        buffer,
      });
      extractMs = Math.round(performance.now() - extractStart);

      logger.info(
        {
          jobId: job.id,
          assetFileId,
          parser: parsed.parser,
          pdfParseDurationMs:
            'pdfParseDurationMs' in parsed ? parsed.pdfParseDurationMs : undefined,
        },
        'extracted text for parsing',
      );

      const rawText = parsed.text.trim();
      const inferredAssessmentMeta = inferAssessmentMetaFromRawText(rawText);
      const { questionText, answerMap, found: answerKeyFound } = extractAnswerKey(rawText);
      const trimmedQuestionText = trimToFirstQuestion(questionText);
      const cleanedQuestionText = cleanQuestionText(trimmedQuestionText);
      const sanitizedQuestionText = sanitizeText(cleanedQuestionText);
      const rawTextLength = sanitizedQuestionText.length;
      const chunkSize = workerEnv.llmChunkSize ?? 10000;
      const llmMode = workerEnv.llmMode;
      const llmInputPreview = sanitizedQuestionText.slice(0, 200);
      let parsedQuestions: ParsedQuestion[] = [];
      let llmError: string | null = null;
      let textParseError: string | null = null;
      let fileParseError: string | null = null;
      let llmParsedCount = 0;
      let fallbackUsed = false;
      let llmChunkCount = 0;
      let llmChunkExecCount = 0;
      let llmChunkConcurrency = 0;
      let llmChunkDurationsMs: number[] = [];
      let llmChunkErrorCount = 0;
      let llmMergeDedupCount = 0;
      let llmMergeFinalCount = 0;
      let preFilterCount = 0;
      let postFilterCount = 0;
      let questionnessDroppedCount = 0;
      let dedupeExactDroppedCount = 0;
      let dedupeFuzzyDroppedCount = 0;
      let mergedFragmentCount = 0;
      let qualityGuardTriggered = false;
      let qualityGuardReason: string | null = null;
      let suspiciousThresholdUsed = 0;
      let llmPath: 'text' | 'file' | 'heuristic' = 'heuristic';
      let fallbackReason: string | null = null;
      let llmTextDurationMs: number | null = null;
      let llmFileDurationMs: number | null = null;
      let llmProviderRequestId: string | null = null;
      let llmOpenAiFileUploadMs: number | null = null;
      let llmOpenAiResponsesMs: number | null = null;
      let textQualityScore: number | null = null;
      let textQualityGatePassed = false;
      let textAttemptSkipped = false;
      let textConfidence: ParseConfidence | null = null;
      let fileConfidence: ParseConfidence | null = null;
      let llmUsageTotals: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      } | null = null;
      let extractedAssessmentMeta: AssessmentMeta | null = null;
      let appliedAssessmentMetaFields: string[] = [];

      const llmStart = performance.now();
      const textChunks =
        llmMode === 'chunk'
          ? buildTextChunks(sanitizedQuestionText, chunkSize, TEXT_CHUNK_OVERLAP_CHARS)
          : [];

      if (llmMode === 'chunk') {
        llmChunkCount = textChunks.length;
      }

      textQualityScore = scoreTextSignalRatio(sanitizedQuestionText);
      textQualityGatePassed =
        rawTextLength >= MIN_TEXT_ATTEMPT_CHARS && textQualityScore >= MIN_TEXT_SIGNAL_RATIO;

      if (sanitizedQuestionText && textQualityGatePassed) {
        logger.info(
          {
            jobId: job.id,
            assetFileId,
            llmProvider: workerEnv.llmProvider,
            llmModel: workerEnv.llmModel,
            llmInputPreview,
            llmInputChars: rawTextLength,
            textQualityScore,
            llmMode,
            llmChunkCount: llmMode === 'chunk' ? llmChunkCount : null,
            llmChunkSize: llmMode === 'chunk' ? chunkSize : null,
          },
          'sending extracted text to llm',
        );

        const llmTextStart = performance.now();
        try {
          const shouldExecuteChunks =
            ENABLE_LLM_CHUNK_EXECUTION && llmMode === 'chunk' && textChunks.length > 1;
          let textResultQuestions: ParsedQuestion[] = [];
          let textResultUsage: {
            inputTokens: number;
            outputTokens: number;
            totalTokens: number;
          } | null = null;

          if (shouldExecuteChunks) {
            const chunkResult = await parseTextChunksDetailed({
              chunks: textChunks,
              concurrency: LLM_CHUNK_EXECUTION_CONCURRENCY,
            });

            llmChunkExecCount = textChunks.length;
            llmChunkConcurrency = chunkResult.workerCount;
            llmChunkDurationsMs = chunkResult.durations;
            llmChunkErrorCount = chunkResult.errors.length;

            if (chunkResult.errors.length > 0) {
              logger.warn(
                {
                  jobId: job.id,
                  assetFileId,
                  llmChunkErrorCount: chunkResult.errors.length,
                  llmChunkErrors: chunkResult.errors,
                },
                'chunk parsing encountered errors',
              );
            }

            const merged = mergeChunkResults(chunkResult.questions);
            llmMergeDedupCount = merged.dedupedCount;
            llmMergeFinalCount = merged.finalCount;
            textResultQuestions = merged.questions;
            textResultUsage = chunkResult.usageTotals;
          } else {
            const singleResult = await parseQuestionsWithLlmDetailed({
              text: sanitizedQuestionText,
            });
            textResultQuestions = singleResult.questions;
            extractedAssessmentMeta = normalizeAssessmentMeta(singleResult.assessmentMeta);
            llmProviderRequestId = singleResult.diagnostics?.providerRequestId ?? null;
            textResultUsage = singleResult.usage
              ? {
                  inputTokens: singleResult.usage.inputTokens ?? 0,
                  outputTokens: singleResult.usage.outputTokens ?? 0,
                  totalTokens: singleResult.usage.totalTokens ?? 0,
                }
              : null;
          }

          const stabilizedQuestions = stabilizeParsedQuestions(textResultQuestions);
          preFilterCount = stabilizedQuestions.preFilterCount;
          postFilterCount = stabilizedQuestions.postFilterCount;
          questionnessDroppedCount = stabilizedQuestions.questionnessDroppedCount;
          mergedFragmentCount = stabilizedQuestions.mergedFragmentCount;
          textResultQuestions = stabilizedQuestions.questions;

          const dedupedQuestions = dedupeParsedQuestions(textResultQuestions);
          dedupeExactDroppedCount = dedupedQuestions.dedupeExactDroppedCount;
          dedupeFuzzyDroppedCount = dedupedQuestions.dedupeFuzzyDroppedCount;
          textResultQuestions = dedupedQuestions.questions;
          postFilterCount = textResultQuestions.length;

          const suspiciousCount = isSuspiciousQuestionCount(
            textResultQuestions.length,
            rawTextLength,
          );
          suspiciousThresholdUsed = suspiciousCount.threshold;

          llmTextDurationMs = Math.round(performance.now() - llmTextStart);
          if (suspiciousCount.suspicious) {
            qualityGuardTriggered = true;
            qualityGuardReason = 'suspicious_question_count';
            textConfidence = {
              pass: false,
              reason: `suspicious_question_count:${textResultQuestions.length}>${suspiciousCount.threshold}`,
              parsedCount: textResultQuestions.length,
              normalizedCount: textResultQuestions.length,
              validCount: textResultQuestions.length,
              validRatio: 1,
            };
          } else {
            textConfidence = evaluateParseConfidence(textResultQuestions);
          }

          if (textConfidence.pass) {
            parsedQuestions = textResultQuestions;
            llmParsedCount = parsedQuestions.length;
            llmPath = 'text';
            llmUsageTotals = textResultUsage;
          } else {
            qualityGuardReason ??= textConfidence.reason;
            fallbackReason = `text_low_confidence:${textConfidence.reason}`;
          }
        } catch (error) {
          llmTextDurationMs = Math.round(performance.now() - llmTextStart);
          textParseError = error instanceof Error ? error.message : 'text llm error';
          fallbackReason = 'text_parse_error';
        }
      } else {
        textAttemptSkipped = true;
        fallbackReason = sanitizedQuestionText
          ? 'text_quality_gate_failed'
          : 'empty_sanitized_text';
      }

      if (parsedQuestions.length === 0) {
        logger.info(
          {
            jobId: job.id,
            assetFileId,
            llmProvider: workerEnv.llmProvider,
            llmModel: workerEnv.llmModel,
            llmInputPreview,
            llmMode,
            llmChunkCount: llmMode === 'chunk' ? llmChunkCount : null,
            llmChunkSize: llmMode === 'chunk' ? chunkSize : null,
            fallbackReason,
          },
          'sending file to llm',
        );

        const llmFileStart = performance.now();
        try {
          const fileName = getFileNameFromStorageUrl(assetFile.storageUrl) ?? 'assessment-file';
          const fileResult = await parseQuestionsWithLlmFileDetailed({
            fileBuffer: buffer,
            fileName,
            mimeType: assetFile.mimeType,
          });
          llmFileDurationMs = Math.round(performance.now() - llmFileStart);
          llmProviderRequestId = fileResult.diagnostics?.providerRequestId ?? null;
          llmOpenAiFileUploadMs = fileResult.diagnostics?.openaiFileUploadMs ?? null;
          llmOpenAiResponsesMs = fileResult.diagnostics?.openaiResponsesMs ?? null;
          fileConfidence = evaluateParseConfidence(fileResult.questions);
          parsedQuestions = fileResult.questions;
          extractedAssessmentMeta = normalizeAssessmentMeta(fileResult.assessmentMeta);
          llmParsedCount = parsedQuestions.length;
          llmPath = 'file';
          llmUsageTotals = fileResult.usage
            ? {
                inputTokens: fileResult.usage.inputTokens ?? 0,
                outputTokens: fileResult.usage.outputTokens ?? 0,
                totalTokens: fileResult.usage.totalTokens ?? 0,
              }
            : null;
        } catch (error) {
          llmFileDurationMs = Math.round(performance.now() - llmFileStart);
          fileParseError = error instanceof Error ? error.message : 'file llm error';
        }
      }

      llmMs = Math.round(performance.now() - llmStart);
      llmError = parsedQuestions.length === 0 ? (fileParseError ?? textParseError) : null;

      if (textParseError || fileParseError) {
        logger.warn(
          {
            jobId: job.id,
            assetFileId,
            textParseError,
            fileParseError,
            fallbackReason,
          },
          'llm parsing used fallback path',
        );
      }

      const shouldFailForProviderErrors =
        parsedQuestions.length === 0 &&
        (isHardLlmFailure(textParseError) || isHardLlmFailure(fileParseError));

      if (shouldFailForProviderErrors) {
        throw new Error(
          `LLM parsing failed due provider/API error. textParseError=${textParseError ?? 'none'} fileParseError=${fileParseError ?? 'none'}`,
        );
      }

      if (parsedQuestions.length === 0 && questionText) {
        fallbackUsed = true;
        llmPath = 'heuristic';
        parsedQuestions = splitQuestions(questionText).map((prompt) => ({
          type: 'written',
          prompt,
        }));
        llmParsedCount = parsedQuestions.length;
      }

      logger.info(
        {
          jobId: job.id,
          assetFileId,
          llmProvider: workerEnv.llmProvider,
          llmModel: workerEnv.llmModel,
          llmParsedCount,
          llmInputChars: rawTextLength,
          llmTruncated: false,
          llmMode,
          llmPath,
          llmTextDurationMs,
          llmFileDurationMs,
          textQualityGatePassed,
          textQualityScore,
          textAttemptSkipped,
          textConfidence,
          fileConfidence,
          fallbackReason,
          textParseError,
          fileParseError,
          llmChunkCount,
          llmChunkExecCount,
          llmChunkConcurrency,
          llmChunkDurationsMs,
          llmChunkErrorCount,
          llmMergeDedupCount,
          llmMergeFinalCount,
          preFilterCount,
          postFilterCount,
          questionnessDroppedCount,
          dedupeExactDroppedCount,
          dedupeFuzzyDroppedCount,
          mergedFragmentCount,
          qualityGuardTriggered,
          qualityGuardReason,
          suspiciousThresholdUsed,
          llmChunkSize: llmMode === 'chunk' ? chunkSize : null,
          llmUsageTotals,
          llmProviderRequestId,
          llmOpenAiFileUploadMs,
          llmOpenAiResponsesMs,
          extractedAssessmentMeta,
          inferredAssessmentMeta,
          fallbackUsed,
          llmError,
          finalQuestionCount: parsedQuestions.length,
          answerKeyFound,
        },
        'llm parse summary',
      );

      const normalizeValidateStart = performance.now();
      const normalizedQuestions = normalizeQuestions(parsedQuestions);
      const enrichedQuestions = normalizedQuestions.map((item, index) => {
        if (
          answerKeyFound &&
          answerMap.has(index + 1) &&
          (item.type === 'multiple_choice' || item.type === 'true_false')
        ) {
          return {
            ...item,
            correctAnswer: {
              label: answerMap.get(index + 1) ?? null,
              text: null,
            },
          };
        }
        return item;
      });
      const validatedQuestions = enrichedQuestions.filter(
        (item) => questionPayloadSchema.safeParse(item).success,
      );
      const droppedCount = enrichedQuestions.length - validatedQuestions.length;
      if (droppedCount > 0) {
        logger.warn(
          { jobId: job.id, assetFileId, droppedCount },
          'dropped invalid questions after validation',
        );
      }
      normalizeValidateMs = Math.round(performance.now() - normalizeValidateStart);

      const dbWriteStart = performance.now();

      const [draftVersion] = await db
        .select()
        .from(assessmentVersions)
        .where(
          and(
            eq(assessmentVersions.assessmentId, assetFile.assessmentId),
            eq(assessmentVersions.status, 'draft'),
          ),
        )
        .orderBy(desc(assessmentVersions.versionNumber))
        .limit(1);

      const activeVersion = draftVersion
        ? draftVersion
        : await (async () => {
            const [latestVersion] = await db
              .select()
              .from(assessmentVersions)
              .where(eq(assessmentVersions.assessmentId, assetFile.assessmentId))
              .orderBy(desc(assessmentVersions.versionNumber))
              .limit(1);

            const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

            const [created] = await db
              .insert(assessmentVersions)
              .values({
                assessmentId: assetFile.assessmentId,
                versionNumber: nextVersionNumber,
                status: 'draft',
              })
              .returning();

            if (!created) {
              throw new Error('Failed to create draft assessment version');
            }

            return created;
          })();

      const normalizedAssessmentMeta = mergeAssessmentMeta(
        extractedAssessmentMeta,
        inferredAssessmentMeta,
      );
      const fileName = getFileNameFromStorageUrl(assetFile.storageUrl);
      const fileBaseTitle = fileName ? fileName.replace(/\.[^/.]+$/, '').trim() : null;
      if (normalizedAssessmentMeta) {
        const [assessment] = await db
          .select({
            id: assessments.id,
            title: assessments.title,
            subject: assessments.subject,
            grade: assessments.grade,
          })
          .from(assessments)
          .where(eq(assessments.id, assetFile.assessmentId))
          .limit(1);

        if (assessment) {
          const assessmentUpdates: Partial<{
            title: string;
            subject: string;
            grade: string;
            updatedAt: Date;
          }> = {};

          const metadataTitle = normalizedAssessmentMeta.title;
          const shouldApplyMetadataTitle =
            isValidMetadataTitle(metadataTitle) &&
            isPlaceholderTitle(assessment.title, fileBaseTitle) &&
            normalizeTitleForComparison(metadataTitle) !==
              normalizeTitleForComparison(assessment.title);

          if (shouldApplyMetadataTitle && metadataTitle) {
            assessmentUpdates.title = metadataTitle;
            appliedAssessmentMetaFields.push('title');
            logger.info(
              {
                jobId: job.id,
                assetFileId,
                oldTitle: assessment.title,
                newTitle: metadataTitle,
                fileBaseTitle: fileBaseTitle ?? undefined,
                reason: 'replace-placeholder-title-with-metadata',
              },
              'applied parsed title metadata to assessment',
            );
          }

          if (normalizedAssessmentMeta.subject && !hasTextValue(assessment.subject)) {
            assessmentUpdates.subject = normalizedAssessmentMeta.subject;
            appliedAssessmentMetaFields.push('subject');
          }

          if (normalizedAssessmentMeta.grade && !hasTextValue(assessment.grade)) {
            assessmentUpdates.grade = normalizedAssessmentMeta.grade;
            appliedAssessmentMetaFields.push('grade');
          }

          if (Object.keys(assessmentUpdates).length > 0) {
            assessmentUpdates.updatedAt = new Date();
            await db
              .update(assessments)
              .set(assessmentUpdates)
              .where(eq(assessments.id, assessment.id));
          }
        }
      }

      await db.delete(questions).where(eq(questions.assessmentVersionId, activeVersion.id));

      if (validatedQuestions.length > 0) {
        await db.insert(questions).values(
          validatedQuestions.map((question, index) => ({
            assessmentVersionId: activeVersion.id,
            type: question.type,
            prompt: question.prompt,
            choices: question.choices,
            correctAnswer: question.correctAnswer,
            orderIndex: index + 1,
          })),
        );
      }

      dbWriteMs = Math.round(performance.now() - dbWriteStart);

      await db
        .update(parsingJobs)
        .set({
          status: 'success',
          errorMessage: null,
          metadata: {
            queueWaitMs,
            downloadMs,
            extractMs,
            llmMs,
            normalizeValidateMs,
            rawTextLength,
            questionCount: validatedQuestions.length,
            parser: parsed.parser,
            pdfParseDurationMs:
              'pdfParseDurationMs' in parsed ? parsed.pdfParseDurationMs : undefined,
            answerKeyFound,
            llmProvider: workerEnv.llmProvider,
            llmModel: workerEnv.llmModel,
            llmInputMode: llmPath,
            llmSchema: 'questions-v1',
            llmParsedCount: normalizedQuestions.length,
            llmInputChars: rawTextLength,
            llmTruncated: false,
            llmInputPreview,
            llmMode,
            llmPath,
            llmTextDurationMs,
            llmFileDurationMs,
            textQualityGatePassed,
            textQualityScore,
            textAttemptSkipped,
            textConfidence,
            fileConfidence,
            fallbackReason,
            textParseError,
            fileParseError,
            llmChunkCount,
            llmChunkExecCount,
            llmChunkConcurrency,
            llmChunkDurationsMs,
            llmChunkErrorCount,
            llmMergeDedupCount,
            llmMergeFinalCount,
            preFilterCount,
            postFilterCount,
            questionnessDroppedCount,
            dedupeExactDroppedCount,
            dedupeFuzzyDroppedCount,
            mergedFragmentCount,
            qualityGuardTriggered,
            qualityGuardReason,
            suspiciousThresholdUsed,
            llmChunkSize: llmMode === 'chunk' ? chunkSize : null,
            llmUsageTotals,
            llmProviderRequestId,
            llmOpenAiFileUploadMs,
            llmOpenAiResponsesMs,
            extractedAssessmentMeta,
            inferredAssessmentMeta,
            appliedAssessmentMetaFields,
            fallbackUsed,
            llmError,
            dbWriteMs,
            elapsedMs: Date.now() - startedAt,
          },
          updatedAt: new Date(),
        })
        .where(eq(parsingJobs.id, parsingJob.id));

      logger.info(
        {
          jobId: job.id,
          assetFileId,
          questionCount: enrichedQuestions.length,
          parser: parsed.parser,
        },
        'parsing job completed',
      );
    } catch (error) {
      await db
        .update(parsingJobs)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'unknown error',
          metadata: {
            queueWaitMs,
            downloadMs,
            extractMs,
            llmMs,
            normalizeValidateMs,
            dbWriteMs,
            elapsedMs: Date.now() - startedAt,
          },
          updatedAt: new Date(),
        })
        .where(eq(parsingJobs.id, parsingJob.id));

      logger.error({ jobId: job.id, assetFileId, err: error }, 'parsing job failed');
    }
  },
  {
    connection: {
      url: redisUrl,
    },
    concurrency: parsingConcurrency,
  },
);

parsingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, name: job.name }, 'parsing job completed');
});

parsingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'parsing job failed');
});

export const questionGenerationWorker = new Worker(
  'question-generation',
  async (job) => {
    const startedAt = Date.now();
    const jobId = job.data?.jobId as string | undefined;
    const questionId = job.data?.questionId as string | undefined;
    const assessmentVersionId = job.data?.assessmentVersionId as string | undefined;
    const targetCorrectRate = job.data?.targetCorrectRate as number | undefined;
    const generationMode = job.data?.mode === 'insert' ? 'insert' : 'replace';
    const generationStyle = job.data?.style === 'similar' ? 'similar' : 'rewrite';
    let queueWaitMs: number | null = null;
    let dbReadMs: number | null = null;
    let dbWriteMs: number | null = null;

    if (!jobId || !questionId || !assessmentVersionId || typeof targetCorrectRate !== 'number') {
      logger.error({ jobId: job.id }, 'question generation job missing payload');
      return;
    }

    const [generationJobRecord] = await db
      .select({ createdAt: questionGenerationJobs.createdAt })
      .from(questionGenerationJobs)
      .where(eq(questionGenerationJobs.id, jobId))
      .limit(1);

    if (!generationJobRecord) {
      logger.error({ jobId }, 'question generation job record not found');
      return;
    }

    queueWaitMs = Math.max(0, startedAt - generationJobRecord.createdAt.getTime());

    await db
      .update(questionGenerationJobs)
      .set({ status: 'running', errorMessage: null, updatedAt: new Date() })
      .where(eq(questionGenerationJobs.id, jobId));

    try {
      const dbReadStart = performance.now();
      const [record] = await db
        .select({
          question: questions,
          assessmentVersion: assessmentVersions,
          assessment: assessments,
        })
        .from(questions)
        .innerJoin(assessmentVersions, eq(questions.assessmentVersionId, assessmentVersions.id))
        .innerJoin(assessments, eq(assessmentVersions.assessmentId, assessments.id))
        .where(and(eq(questions.id, questionId), eq(assessmentVersions.id, assessmentVersionId)))
        .limit(1);
      dbReadMs = Math.round(performance.now() - dbReadStart);

      if (!record) {
        throw new Error('question or assessment version not found');
      }

      const prompt = buildGenerationPrompt({
        style: generationStyle,
        targetCorrectRate,
        assessment: {
          title: record.assessment.title,
          description: record.assessment.description ?? null,
          assessmentCategory: record.assessment.assessmentCategory ?? null,
          customCategoryLabel: record.assessment.customCategoryLabel ?? null,
          subject: record.assessment.subject ?? null,
          grade: record.assessment.grade ?? null,
        },
        question: {
          type: record.question.type,
          prompt: record.question.prompt,
          choices: (record.question.choices ?? null) as string[] | null,
          correctAnswer: record.question.correctAnswer as {
            label: string | null;
            text: string | null;
          },
          points: record.question.points ?? null,
        },
      });

      const promptHash = createHash('sha256').update(prompt).digest('hex');
      const llmStart = performance.now();
      const result = await generateQuestionWithLlmDetailed({ prompt });
      const llmDurationMs = Math.round(performance.now() - llmStart);
      const llmProviderRequestId = result.diagnostics?.providerRequestId ?? null;
      const generated = result.questions[0];

      if (!generated) {
        throw new Error('LLM did not return a question');
      }

      if (generated.type !== record.question.type) {
        throw new Error('LLM returned mismatched question type');
      }

      const originalChoices = record.question.choices as string[] | null;
      const generatedChoices = generated.choices ?? null;

      if (
        originalChoices &&
        (!generatedChoices || generatedChoices.length !== originalChoices.length)
      ) {
        throw new Error('LLM returned mismatched choice count');
      }

      if (!originalChoices && generatedChoices) {
        throw new Error('LLM returned choices for non-choice question');
      }

      const finalQuestion = {
        type: record.question.type,
        prompt: generated.prompt,
        choices: generatedChoices,
        correctAnswer: generated.correctAnswer,
        points: record.question.points ?? null,
        orderIndex: record.question.orderIndex,
      };

      const validation = questionPayloadSchema.safeParse(finalQuestion);

      if (!validation.success) {
        throw new Error(`Invalid question payload: ${JSON.stringify(validation.error.flatten())}`);
      }

      let resultQuestionId = record.question.id;
      const dbWriteStart = performance.now();

      if (generationMode === 'replace') {
        await db
          .update(questions)
          .set({
            type: finalQuestion.type,
            prompt: finalQuestion.prompt,
            choices: finalQuestion.choices,
            correctAnswer: finalQuestion.correctAnswer,
            points: finalQuestion.points,
            updatedAt: new Date(),
          })
          .where(eq(questions.id, record.question.id));
      } else {
        const inserted = await db.transaction(async (tx) => {
          await tx
            .update(questions)
            .set({
              orderIndex: sql`${questions.orderIndex} + 1`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(questions.assessmentVersionId, assessmentVersionId),
                gt(questions.orderIndex, record.question.orderIndex),
              ),
            );

          const [newQuestion] = await tx
            .insert(questions)
            .values({
              assessmentVersionId,
              type: finalQuestion.type,
              prompt: finalQuestion.prompt,
              choices: finalQuestion.choices,
              correctAnswer: finalQuestion.correctAnswer,
              points: finalQuestion.points,
              orderIndex: record.question.orderIndex + 1,
            })
            .returning({ id: questions.id });

          return newQuestion;
        });

        if (!inserted) {
          throw new Error('failed to insert generated question');
        }
        resultQuestionId = inserted.id;
      }

      dbWriteMs = Math.round(performance.now() - dbWriteStart);

      await db
        .update(questionGenerationJobs)
        .set({
          status: 'success',
          errorMessage: null,
          metadata: {
            originalQuestion: {
              id: record.question.id,
              type: record.question.type,
              prompt: record.question.prompt,
              choices: record.question.choices,
              correctAnswer: record.question.correctAnswer,
              points: record.question.points,
              orderIndex: record.question.orderIndex,
            },
            assessmentContext: {
              assessmentId: record.assessment.id,
              assessmentVersionId: record.assessmentVersion.id,
              title: record.assessment.title,
              description: record.assessment.description ?? null,
              subject: record.assessment.subject ?? null,
              grade: record.assessment.grade ?? null,
              assessmentCategory: record.assessment.assessmentCategory ?? null,
              customCategoryLabel: record.assessment.customCategoryLabel ?? null,
            },
            mode: generationMode,
            style: generationStyle,
            resultQuestionId,
            targetCorrectRate,
            queueWaitMs,
            dbReadMs,
            dbWriteMs,
            llm: {
              provider: workerEnv.llmProvider,
              model: workerEnv.llmModel,
              promptHash,
              promptPreview: prompt.slice(0, 200),
              inputTokens: result.usage?.inputTokens ?? null,
              outputTokens: result.usage?.outputTokens ?? null,
              totalTokens: result.usage?.totalTokens ?? null,
              durationMs: llmDurationMs,
              llmCallMs: result.diagnostics?.llmCallMs ?? llmDurationMs,
              providerRequestId: llmProviderRequestId,
            },
            result: {
              type: finalQuestion.type,
              prompt: finalQuestion.prompt,
              choices: finalQuestion.choices,
              correctAnswer: finalQuestion.correctAnswer,
              points: finalQuestion.points,
            },
            validation: {
              schema: 'questionPayloadSchema',
              passed: true,
              errors: null,
            },
            elapsedMs: Date.now() - startedAt,
          },
          updatedAt: new Date(),
        })
        .where(eq(questionGenerationJobs.id, jobId));

      logger.info({ jobId, questionId }, 'question generation completed');
    } catch (error) {
      await db
        .update(questionGenerationJobs)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'unknown error',
          metadata: {
            queueWaitMs,
            dbReadMs,
            dbWriteMs,
            elapsedMs: Date.now() - startedAt,
          },
          updatedAt: new Date(),
        })
        .where(eq(questionGenerationJobs.id, jobId));

      logger.error({ jobId, questionId, err: error }, 'question generation failed');
    }
  },
  {
    connection: {
      url: redisUrl,
    },
  },
);

questionGenerationWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, name: job.name }, 'question generation job completed');
});

questionGenerationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'question generation job failed');
});
