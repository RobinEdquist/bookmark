/**
 * Strip credential-bearing query-string values before a URL is written to any
 * log line (request logger, exception filter, error messages). Query-string
 * authentication is no longer accepted, but old clients may still send it and
 * OAuth callbacks legitimately carry one-time codes — none of that may end up
 * in logs.
 */
const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'key',
  'apikey',
  'api_key',
  'secret',
  'password',
  'authorization',
  'access_token',
  'refresh_token',
  'id_token',
  'code',
  'state',
]);

export function redactUrl(url: string): string;
export function redactUrl(url: undefined): undefined;
export function redactUrl(url: string | undefined): string | undefined;
export function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;

  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return url;

  const path = url.slice(0, queryIndex);
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(url.slice(queryIndex + 1));
  } catch {
    // Unparsable query string: drop it entirely rather than risk logging it
    return `${path}?[REDACTED]`;
  }

  let redacted = false;
  for (const name of [...params.keys()]) {
    if (SENSITIVE_QUERY_PARAMS.has(name.toLowerCase())) {
      params.set(name, '[REDACTED]');
      redacted = true;
    }
  }

  return redacted ? `${path}?${params.toString()}` : url;
}
