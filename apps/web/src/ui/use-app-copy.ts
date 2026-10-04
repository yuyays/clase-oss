import { APP_COPY as APP_COPY_EN } from '@/ui/app-copy-en';
import { APP_COPY as APP_COPY_JA } from '@/ui/app-copy-ja';
import { useLocale } from '@/ui/locale';

export const useAppCopy = () => {
  const { locale } = useLocale();
  return locale === 'ja' ? APP_COPY_JA : APP_COPY_EN;
};
