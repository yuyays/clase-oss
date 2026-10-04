import 'dotenv/config';

import { desc } from 'drizzle-orm';

import { db } from './drizzle.js';
import { questions } from './schema/questions.js';
import { assessmentVersions, assessments } from './schema/tests.js';

const run = async () => {
  const [assessment] = await db
    .insert(assessments)
    .values({
      title: 'Sample Midterm',
      description: 'Seeded assessment for local development.',
      assessmentCategory: 'midterm',
      subject: 'Math',
      grade: '8',
    })
    .returning();

  if (!assessment) {
    throw new Error('Failed to create seed assessment');
  }

  const [version] = await db
    .insert(assessmentVersions)
    .values({
      assessmentId: assessment.id,
      versionNumber: 1,
      status: 'draft',
    })
    .returning();

  if (!version) {
    throw new Error('Failed to create seed assessment version');
  }

  await db.insert(questions).values([
    {
      assessmentVersionId: version.id,
      type: 'multiple_choice',
      prompt: 'What is 7 × 8?',
      choices: ['54', '56', '58', '64'],
      correctAnswer: '56',
      points: 1,
      orderIndex: 1,
    },
    {
      assessmentVersionId: version.id,
      type: 'short_answer',
      prompt: 'Explain the steps you would take to solve 15 ÷ 3.',
      correctAnswer: 'Divide 15 into three equal groups to get 5.',
      points: 2,
      orderIndex: 2,
    },
  ]);

  const [latestAssessment] = await db
    .select()
    .from(assessments)
    .orderBy(desc(assessments.createdAt))
    .limit(1);

  console.log('Seeded assessment:', latestAssessment?.title ?? 'unknown');
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
