import { useCallback, useEffect, useState } from 'react';

export const useLocalStorage = <T>(key: string, initialValue: T) => {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  }, [key, value]);

  const setStoredValue = useCallback((next: T | ((current: T) => T)) => {
    setValue((current) => (typeof next === 'function' ? (next as (value: T) => T)(current) : next));
  }, []);

  return [value, setStoredValue] as const;
};
