import { EDITOR_COPY as EDITOR_COPY_EN } from '@/ui/editor/editor-copy-en';
import { EDITOR_COPY as EDITOR_COPY_JA } from '@/ui/editor/editor-copy-ja';
import { useLocale } from '@/ui/locale';

export const useEditorCopy = () => {
  const { locale } = useLocale();
  return locale === 'ja' ? EDITOR_COPY_JA : EDITOR_COPY_EN;
};
