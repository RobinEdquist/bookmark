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

/**
 * Upper bound on the logged `X-Bookmark-Client` value. The header is
 * client-controlled, so cap it rather than let a hostile client bloat every
 * log line.
 */
const MAX_CLIENT_HEADER_LENGTH = 100;

type HeaderValue = string | string[] | undefined;

export interface LoggableRequest {
  id?: unknown;
  method?: string;
  url?: string;
  remoteAddress?: string;
  headers?: Record<string, HeaderValue>;
}

export interface SerializedRequest {
  id?: unknown;
  method?: string;
  url?: string;
  remoteAddress?: string;
  /** `X-Bookmark-Client` as sent by the mobile apps, e.g. "bookmark-iOS 1.0(26)". */
  client?: string;
}

/**
 * pino-http `req` serializer. The default serializer dumps every request
 * header — including session cookies and bearer tokens — into each log line,
 * so this allow-lists fields instead of spreading `req.headers`. The only
 * header that gets through is `X-Bookmark-Client`, which the mobile apps set
 * to their app name and version; it is treated as an opaque, length-capped
 * string and omitted when absent.
 */
export function serializeRequestForLog(
  req: LoggableRequest,
): SerializedRequest {
  const serialized: SerializedRequest = {
    id: req.id,
    method: req.method,
    url: redactUrl(req.url),
    remoteAddress: req.remoteAddress,
  };

  const client = clientHeaderValue(req.headers?.['x-bookmark-client']);
  if (client !== undefined) {
    serialized.client = client;
  }

  return serialized;
}

function clientHeaderValue(raw: HeaderValue): string | undefined {
  // Node joins repeated headers into one string, but stay defensive.
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value.slice(0, MAX_CLIENT_HEADER_LENGTH);
}
