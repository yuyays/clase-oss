import { parsingWorker, questionGenerationWorker } from './jobs.js';
import { startAssessmentCleanup } from './cleanup.js';

const stopAssessmentCleanup = startAssessmentCleanup();

const shutdown = async (signal: string) => {
  console.log(`worker shutting down: ${signal}`);
  stopAssessmentCleanup();
  await Promise.all([parsingWorker.close(), questionGenerationWorker.close()]);
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
