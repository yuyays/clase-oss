#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5-mini-2025-08-07';
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx']);

const loadDotEnv = async (envPath) => {
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
};

const getMimeType = (ext) => {
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
};

const systemPrompt = [
  'You extract assessment data from teacher-provided documents.',
  'Return ONLY valid JSON that matches the required schema.',
  'Infer assessmentCategory when possible (quiz|midterm|final|practice|other); otherwise null.',
  'Question types must be one of: multiple_choice, true_false, short_answer, written, other.',
  'Use choices as an array of strings for multiple choice; use null or [] for non-choice questions.',
  'correctAnswer must include both label and text when possible; use nulls when unknown.',
  'orderIndex must be 1-based and sequential.',
  'sourceText must be a short excerpt (1-2 lines) that supports each question/answer.',
  'confidence must be an integer 0-100.',
].join(' ');

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['assessment', 'questions'],
  properties: {
    assessment: {
      type: 'object',
      additionalProperties: false,
      required: [
        'title',
        'description',
        'assessmentCategory',
        'customCategoryLabel',
        'subject',
        'grade',
      ],
      properties: {
        title: { type: 'string' },
        description: { type: ['string', 'null'] },
        assessmentCategory: {
          type: ['string', 'null'],
          enum: ['quiz', 'midterm', 'final', 'practice', 'other', null],
        },
        customCategoryLabel: { type: ['string', 'null'] },
        subject: { type: ['string', 'null'] },
        grade: { type: ['string', 'null'] },
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'type',
          'prompt',
          'choices',
          'correctAnswer',
          'points',
          'orderIndex',
          'sourceText',
          'confidence',
        ],
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
          points: { type: ['number', 'null'] },
          orderIndex: { type: 'number' },
          sourceText: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
  },
};

const extractOutputText = (json) => {
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

const run = async () => {
  await loadDotEnv(path.resolve(process.cwd(), '.env'));

  const args = process.argv.slice(2);
  const filePath = args[0];
  if (!filePath) {
    console.error('Usage: node scripts/openai-extract.mjs <path-to-pdf-or-docx> [--out <dir>]');
    process.exit(1);
  }
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args[outIndex + 1] : null;
  if (outIndex >= 0 && !outDir) {
    console.error('Missing value for --out <dir>');
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY (or OPENAI_APIKEY) is required');
    process.exit(1);
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const absolutePath = path.resolve(filePath);
  const ext = path.extname(absolutePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    console.error('Only PDF and DOCX files are supported');
    process.exit(1);
  }

  const fileBuffer = await fs.readFile(absolutePath);

  const uploadForm = new FormData();
  uploadForm.append('purpose', 'assistants');
  uploadForm.append(
    'file',
    new Blob([fileBuffer], { type: getMimeType(ext) }),
    path.basename(absolutePath),
  );

  const uploadResponse = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: uploadForm,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error(`OpenAI file upload failed: ${uploadResponse.status} ${errorText}`);
    process.exit(1);
  }

  const uploadJson = await uploadResponse.json();
  const fileId = uploadJson?.id;
  if (!fileId) {
    console.error('OpenAI file upload response missing file id');
    process.exit(1);
  }

  const payload = {
    model,
    store: false,
    text: {
      format: {
        type: 'json_schema',
        name: 'assessment_extract',
        schema,
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
            text: 'Extract assessment and questions from this document.',
          },
          {
            type: 'input_file',
            file_id: fileId,
          },
        ],
      },
    ],
  };

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`OpenAI request failed: ${response.status} ${errorText}`);
    process.exit(1);
  }

  const json = await response.json();
  const outputText = extractOutputText(json);
  if (!outputText) {
    console.error('OpenAI response was empty');
    process.exit(1);
  }

  const parsed = JSON.parse(outputText);
  const jsonOutput = `${JSON.stringify(parsed, null, 2)}\n`;

  if (outDir) {
    const resolvedOutDir = path.resolve(outDir);
    await fs.mkdir(resolvedOutDir, { recursive: true });
    const baseName = path.basename(absolutePath, ext);
    const outPath = path.join(resolvedOutDir, `${baseName}.json`);
    await fs.writeFile(outPath, jsonOutput, 'utf8');
    process.stdout.write(`${outPath}\n`);
    return;
  }

  process.stdout.write(jsonOutput);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
