import { z } from 'zod';

export const assessmentCategorySchema = z.enum(['quiz', 'midterm', 'final', 'practice', 'other']);

export const assessmentPayloadSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    assessmentCategory: assessmentCategorySchema.nullable().optional(),
    customCategoryLabel: z.string().nullable().optional(),
    subject: z.string().nullable().optional(),
    grade: z.string().nullable().optional(),
  })
  .strict();

export const questionTypeSchema = z.enum([
  'multiple_choice',
  'true_false',
  'short_answer',
  'written',
  'other',
]);

export const correctAnswerSchema = z
  .object({
    label: z.string().nullable(),
    text: z.string().nullable(),
  })
  .strict();

export const questionPayloadSchema = z
  .object({
    type: questionTypeSchema,
    prompt: z.string().min(1),
    choices: z.array(z.string()).nullable(),
    correctAnswer: correctAnswerSchema,
    points: z.number().int().nullable().optional(),
    orderIndex: z.number().int().min(1),
  })
  .strict();

export const questionsReplacePayloadSchema = z.array(questionPayloadSchema);

export const questionsResponseSchema = z
  .object({
    questions: z.array(questionPayloadSchema),
  })
  .strict();

export const questionsJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['assessmentMeta', 'questions'],
  properties: {
    assessmentMeta: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['title', 'subject', 'grade'],
      properties: {
        title: { type: ['string', 'null'] },
        subject: { type: ['string', 'null'] },
        grade: { type: ['string', 'null'] },
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'prompt', 'choices', 'correctAnswer', 'points', 'orderIndex'],
        properties: {
          type: {
            type: 'string',
            enum: ['multiple_choice', 'true_false', 'short_answer', 'written', 'other'],
          },
          prompt: { type: 'string' },
          choices: {
            type: ['array', 'null'],
            items: { type: 'string' },
          },
          correctAnswer: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'text'],
            properties: {
              label: { type: ['string', 'null'] },
              text: { type: ['string', 'null'] },
            },
          },
          points: { type: ['integer', 'null'] },
          orderIndex: { type: 'integer', minimum: 1 },
        },
      },
    },
  },
};

export const questionRegenerateRequestSchema = z
  .object({
    targetCorrectRate: z.number().int().min(0).max(100).optional(),
    mode: z.enum(['replace', 'insert']).optional(),
    style: z.enum(['rewrite', 'similar']).optional(),
  })
  .strict();

export const questionGenerationJobSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['queued', 'running', 'success', 'failed']),
    errorMessage: z.string().nullable(),
    updatedAt: z.string(),
    mode: z.enum(['replace', 'insert']).optional(),
    style: z.enum(['rewrite', 'similar']).optional(),
    resultQuestionId: z.string().uuid().nullable().optional(),
  })
  .strict();
