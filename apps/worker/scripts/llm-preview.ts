import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

import { parseQuestionsWithLlmDetailed } from '../src/llm/index.js';

const args = process.argv.slice(2);
const showPreview = args.includes('--preview');
const llmModeArg = args.find((arg) => arg.startsWith('--llm-mode='));
const llmMode = llmModeArg?.split('=')[1] ?? 'truncate';
const filePath = args.find((arg) => !arg.startsWith('--'));

if (!['truncate', 'chunk'].includes(llmMode)) {
  console.error('Error: --llm-mode must be truncate or chunk');
  process.exit(1);
}

if (!filePath) {
  console.error('Usage: pnpm llm:preview [--llm-mode=truncate|chunk] [--preview] <file-path>');
  process.exit(1);
}

const buffer = await readFile(filePath);
const extension = path.extname(filePath).toLowerCase();
const startedAt = performance.now();

let text = buffer.toString('utf8');
let mode = 'raw';

if (extension === '.pdf') {
  const pdfParseStart = performance.now();
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  const pdfParseDurationMs = Math.round(performance.now() - pdfParseStart);
  console.error(JSON.stringify({ pdfParseDurationMs }, null, 2));
  text = parsed.text;
  mode = 'pdf';
}

if (extension === '.docx') {
  const parsed = await mammoth.extractRawText({ buffer });
  text = parsed.value;
  mode = 'docx';
}

if (extension === '.doc') {
  console.error('DOC files are not supported. Use DOCX instead.');
  process.exit(1);
}

if (extension === '.png' || extension === '.jpg' || extension === '.jpeg') {
  console.error('Image parsing is not supported without OCR');
  process.exit(1);
}

const maxChars = process.env.LLM_MAX_CHARS ? Number(process.env.LLM_MAX_CHARS) : 12000;
const chunkSize = 10000;
const shouldChunk = llmMode === 'chunk';
const truncated = !shouldChunk && text.length > maxChars;
if (truncated) {
  text = text.slice(0, maxChars);
}

console.error(
  JSON.stringify(
    {
      mode,
      llmMode,
      inputChars: text.length,
      truncated,
    },
    null,
    2,
  ),
);

if (showPreview) {
  const preview = text.slice(0, 500);
  console.error(preview ? `Preview:\n${preview}` : 'Preview: <empty>');
}

try {
  if (!shouldChunk) {
    const llmStart = performance.now();
    const result = await parseQuestionsWithLlmDetailed({ text });
    const llmDurationMs = Math.round(performance.now() - llmStart);
    console.error(JSON.stringify({ llmDurationMs }, null, 2));
    if (result.usage) {
      console.error(JSON.stringify({ usage: result.usage }, null, 2));
    }
    console.log(JSON.stringify({ questions: result.questions }, null, 2));
    const totalDurationMs = Math.round(performance.now() - startedAt);
    console.error(JSON.stringify({ totalDurationMs }, null, 2));
    process.exit(0);
  }

  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += chunkSize) {
    chunks.push(text.slice(start, start + chunkSize));
  }

  console.error(JSON.stringify({ chunks: chunks.length, chunkSize }, null, 2));

  const questions = [] as Awaited<ReturnType<typeof parseQuestionsWithLlmDetailed>>['questions'];
  let totalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  let sawUsage = false;

  for (const [index, chunk] of chunks.entries()) {
    const llmStart = performance.now();
    try {
      const result = await parseQuestionsWithLlmDetailed({ text: chunk });
      const llmDurationMs = Math.round(performance.now() - llmStart);
      questions.push(...result.questions);

      if (result.usage) {
        sawUsage = true;
        totalUsage.inputTokens += result.usage.inputTokens ?? 0;
        totalUsage.outputTokens += result.usage.outputTokens ?? 0;
        totalUsage.totalTokens += result.usage.totalTokens ?? 0;
        console.error(
          JSON.stringify(
            {
              chunkIndex: index + 1,
              chunkChars: chunk.length,
              llmDurationMs,
              usage: result.usage,
            },
            null,
            2,
          ),
        );
      } else {
        console.error(
          JSON.stringify(
            {
              chunkIndex: index + 1,
              chunkChars: chunk.length,
              llmDurationMs,
            },
            null,
            2,
          ),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'llm request failed';
      if (message.includes('returned no questions')) {
        console.error(
          JSON.stringify(
            {
              chunkIndex: index + 1,
              chunkChars: chunk.length,
              error: message,
            },
            null,
            2,
          ),
        );
        continue;
      }
      throw error;
    }
  }

  if (sawUsage) {
    console.error(JSON.stringify({ totalUsage }, null, 2));
  }
  console.log(JSON.stringify({ questions }, null, 2));
  const totalDurationMs = Math.round(performance.now() - startedAt);
  console.error(JSON.stringify({ totalDurationMs }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : 'llm request failed';
  console.error(JSON.stringify({ error: message }, null, 2));
  process.exit(1);
}
