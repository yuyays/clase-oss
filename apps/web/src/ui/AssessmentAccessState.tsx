import { useNavigate } from '@tanstack/react-router';

import { isApiNotFound } from '@/lib/api-client';
import { useLocale } from '@/ui/locale';

import { Button } from '@/components/ui/button';

type AssessmentAccessStateProps = {
  error: unknown;
  onRetry: () => void;
};

const COPY = {
  en: {
    unavailableTitle: 'This upload is unavailable',
    unavailableBody:
      'Uploads are available for 24 hours in the browser where they were created. This link may have expired or been opened in another browser. Upload the file again to continue.',
    failedTitle: 'Could not load this upload',
    failedBody: 'There was a connection or server problem. Try loading it again.',
    newUpload: 'Upload a file',
    retry: 'Try again',
  },
  ja: {
    unavailableTitle: 'このアップロードは利用できません',
    unavailableBody:
      'アップロードしたデータは、作成したブラウザーで24時間利用できます。このリンクの期限が切れたか、別のブラウザーで開いた可能性があります。続けるには、ファイルをもう一度アップロードしてください。',
    failedTitle: 'アップロードを読み込めませんでした',
    failedBody: '接続またはサーバーに問題が発生しました。もう一度読み込んでください。',
    newUpload: 'ファイルをアップロード',
    retry: '再試行',
  },
} as const;

export const AssessmentAccessState = ({ error, onRetry }: AssessmentAccessStateProps) => {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const copy = locale === 'ja' ? COPY.ja : COPY.en;
  const unavailable = isApiNotFound(error);

  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center px-4 py-10 sm:px-6">
      <div
        role="alert"
        className="w-full rounded-2xl border border-[#e1d6c8] bg-[#fcfbf8] p-6 shadow-sm sm:p-10"
      >
        <h1 className="max-w-[32ch] font-display text-2xl font-semibold leading-snug text-[#2b2621] sm:text-3xl">
          {unavailable ? copy.unavailableTitle : copy.failedTitle}
        </h1>
        <p className="mt-4 max-w-[65ch] text-base leading-7 text-[#6b5c4d]">
          {unavailable ? copy.unavailableBody : copy.failedBody}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button onClick={() => navigate({ to: '/' })}>{copy.newUpload}</Button>
          {!unavailable ? (
            <Button variant="outline" onClick={onRetry}>
              {copy.retry}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
};
