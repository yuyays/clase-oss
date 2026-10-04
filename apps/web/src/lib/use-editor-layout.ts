import { useLocalStorage } from '@/lib/use-local-storage';

export type EditorLayoutMode = 'studio' | 'document';

const STORAGE_KEY = 'editor:layout';

export const useEditorLayoutPreference = () => {
  const [layout, setLayout] = useLocalStorage<EditorLayoutMode>(STORAGE_KEY, 'studio');
  return { layout, setLayout };
};
