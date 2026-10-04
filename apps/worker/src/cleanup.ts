import { asc, eq, isNotNull, lte, and } from 'drizzle-orm';

import { assetFiles, assessments, db, storageBucket, supabase } from '@clase/shared/server';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const BATCH_SIZE = 50;

export const cleanupExpiredAssessments = async () => {
  const expired = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(isNotNull(assessments.ownerSessionHash), lte(assessments.expiresAt, new Date())))
    .orderBy(asc(assessments.expiresAt))
    .limit(BATCH_SIZE);

  for (const assessment of expired) {
    const assets = await db
      .select({ storagePath: assetFiles.storageUrl })
      .from(assetFiles)
      .where(eq(assetFiles.assessmentId, assessment.id));

    if (assets.length > 0) {
      const { error } = await supabase.storage
        .from(storageBucket)
        .remove(assets.map((asset) => asset.storagePath));
      if (error) {
        console.error('failed to remove expired assessment files', {
          assessmentId: assessment.id,
          error,
        });
        continue;
      }
    }

    await db.delete(assessments).where(eq(assessments.id, assessment.id));
  }

  return expired.length;
};

export const startAssessmentCleanup = () => {
  const run = () => {
    void cleanupExpiredAssessments().catch((error) => {
      console.error('expired assessment cleanup failed', error);
    });
  };

  run();
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
};
