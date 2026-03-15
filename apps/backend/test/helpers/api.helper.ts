/**
 * Typed API request helper for E2E tests.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

interface RequestOptions {
  cookie?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = any> {
  status: number;
  data: T;
  raw: Response;
}

async function request<T = any>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}/api${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (options.cookie) {
    headers['Cookie'] = options.cookie;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    redirect: 'manual',
  };

  if (options.body && ['POST', 'PATCH', 'PUT'].includes(method)) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);
  let data: T;

  try {
    data = (await response.json()) as T;
  } catch {
    data = undefined as T;
  }

  return { status: response.status, data, raw: response };
}

export const api = {
  get: <T = any>(path: string, cookie?: string) =>
    request<T>('GET', path, { cookie }),

  post: <T = any>(path: string, body?: unknown, cookie?: string) =>
    request<T>('POST', path, { cookie, body }),

  patch: <T = any>(path: string, body: unknown, cookie?: string) =>
    request<T>('PATCH', path, { cookie, body }),

  delete: <T = any>(path: string, cookie?: string) =>
    request<T>('DELETE', path, { cookie }),
};
