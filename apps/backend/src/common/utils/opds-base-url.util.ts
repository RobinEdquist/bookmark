import type { Request } from 'express';

/**
 * Characters allowed in a host reference: hostname labels, dots, digits,
 * port separators, and IPv6 literal brackets/colons. Anything else
 * (schemes, paths, `@`, whitespace, backslashes) is rejected.
 */
const SAFE_HOST_PATTERN = /^[a-zA-Z0-9.\-:[\]]{1,255}$/;

/**
 * Extracts the first value of a (possibly comma-separated, possibly
 * repeated) forwarded header.
 */
function firstForwardedValue(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const first = raw.split(',')[0].trim();
  return first || null;
}

/**
 * Resolves the externally visible base URL for self-referencing links
 * (OPDS feeds). Behind a reverse proxy the socket protocol/host are the
 * internal hop, so the forwarded headers are honored when present — but
 * they are client-controlled, so both are sanitized: the protocol must be
 * exactly http/https, the host a bare hostname[:port] or IPv6 literal.
 *
 * A forged value can only ever poison the requesting client's own feed
 * links (never another user's), but normalizing keeps malformed headers
 * out of generated XML and URLs.
 */
export function resolveExternalBaseUrl(req: Request, basePath: string): string {
  const forwardedProto = firstForwardedValue(req.headers['x-forwarded-proto']);
  const protocol =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : req.protocol === 'https'
        ? 'https'
        : 'http';

  const forwardedHost = firstForwardedValue(req.headers['x-forwarded-host']);
  const hostHeader = firstForwardedValue(req.headers.host);
  const host =
    [forwardedHost, hostHeader].find(
      (candidate) => candidate && SAFE_HOST_PATTERN.test(candidate),
    ) ?? 'localhost';

  return `${protocol}://${host}${basePath}`;
}
