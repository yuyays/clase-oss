export type ApiError = {
  status: number;
  message: string;
  details?: unknown;
};

export const isApiNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'status' in error && error.status === 404;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

const buildUrl = (path: string) => {
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
};

const normalizeErrorMessage = (payload: unknown, fallback: string) => {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object' && 'error' in payload) {
    const errorValue = (payload as { error?: unknown }).error;
    if (typeof errorValue === 'string') return errorValue;
    return fallback;
  }
  return fallback;
};

export const apiFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const headers = new Headers(options.headers);
  const hasBody = options.body !== undefined;

  if (hasBody && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;

  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'connection interrupted';
    const normalizedMessage = /timed out|timeout/i.test(message)
      ? 'request timed out'
      : 'connection interrupted';
    const networkError: ApiError = {
      status: 0,
      message: normalizedMessage,
      details: {
        cause: message,
      },
    };
    throw networkError;
  }

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message = normalizeErrorMessage(payload, response.statusText || 'Request failed');
    const error: ApiError = {
      status: response.status,
      message,
      details: payload && typeof payload === 'object' ? payload : undefined,
    };
    throw error;
  }

  return payload as T;
};
