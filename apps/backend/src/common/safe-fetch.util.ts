import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';

/**
 * SSRF-hardened fetch for URLs that originate from users (e.g. cover image
 * imports). Guarantees:
 *
 * - only http: and https: URLs are fetched;
 * - loopback, private, link-local, CGNAT, multicast, unspecified and cloud
 *   metadata addresses are rejected for both IPv4 and IPv6 (including
 *   IPv4-mapped/NAT64/6to4 embeddings);
 * - address validation happens at connect time through the undici Agent's
 *   lookup hook, so a DNS rebind between check and connect cannot bypass it;
 * - redirects are followed manually with the same validation per hop;
 * - the response body is streamed and aborted as soon as it exceeds the byte
 *   budget, never buffered unbounded;
 * - a single deadline covers the whole operation, including body download.
 */

const MAX_REDIRECTS = 3;

export class BlockedUrlError extends Error {}

export class ResponseTooLargeError extends Error {}

function isDisallowedIpv4(address: string): boolean {
  const octets = address.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o))) {
    return true;
  }
  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** Expand an IPv6 literal into its 16 bytes, or null when unparsable. */
function parseIpv6(address: string): number[] | null {
  // Strip zone id (fe80::1%eth0)
  const bare = address.split('%')[0];

  let head = bare;
  let embeddedV4: string | null = null;
  const v4Match = bare.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Match) {
    head = `${v4Match[1]}0:0`;
    embeddedV4 = v4Match[2];
  }

  const halves = head.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups = part.split(':');
    const words: number[] = [];
    for (const group of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      words.push(parseInt(group, 16));
    }
    return words;
  };

  const left = parseGroups(halves[0]);
  const right = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (left === null || right === null) return null;

  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;

  const words = [...left, ...Array<number>(missing).fill(0), ...right];
  const bytes: number[] = [];
  for (const word of words) {
    bytes.push((word >> 8) & 0xff, word & 0xff);
  }

  if (embeddedV4) {
    const v4Bytes = embeddedV4.split('.').map((part) => Number(part));
    if (v4Bytes.length !== 4 || v4Bytes.some((o) => o < 0 || o > 255)) {
      return null;
    }
    bytes.splice(12, 4, ...v4Bytes);
  }

  return bytes;
}

function isDisallowedIpv6(address: string): boolean {
  const bytes = parseIpv6(address);
  if (!bytes) return true;

  const isZeroPrefix = (length: number) =>
    bytes.slice(0, length).every((byte) => byte === 0);
  const embeddedV4 = () => bytes.slice(12).join('.');

  // ::  (unspecified) and ::1 (loopback)
  if (isZeroPrefix(15)) return true;
  // IPv4-mapped ::ffff:0:0/96 — validate the embedded IPv4 address
  if (isZeroPrefix(10) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isDisallowedIpv4(embeddedV4());
  }
  // Deprecated IPv4-compatible ::/96
  if (isZeroPrefix(12)) {
    return isDisallowedIpv4(embeddedV4());
  }
  // NAT64 64:ff9b::/96
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((byte) => byte === 0)
  ) {
    return isDisallowedIpv4(embeddedV4());
  }
  // 6to4 2002::/16 embeds the IPv4 address in bytes 2..5
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    return isDisallowedIpv4(bytes.slice(2, 6).join('.'));
  }
  // fe80::/10 link-local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;
  // fc00::/7 unique local
  if ((bytes[0] & 0xfe) === 0xfc) return true;
  // ff00::/8 multicast
  if (bytes[0] === 0xff) return true;
  // 2001:db8::/32 documentation
  if (
    bytes[0] === 0x20 &&
    bytes[1] === 0x01 &&
    bytes[2] === 0x0d &&
    bytes[3] === 0xb8
  ) {
    return true;
  }

  return false;
}

/**
 * True when the address must not be connected to. Anything that does not
 * parse as an IP address is also rejected (fail closed).
 */
export function isDisallowedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isDisallowedIpv4(address);
  if (family === 6) return isDisallowedIpv6(address);
  return true;
}

/**
 * Validate a caller-supplied URL: http(s) only, and IP-literal hosts must not
 * point at a blocked range. Hostnames are validated again at connect time.
 * Throws BlockedUrlError; returns the parsed URL.
 */
export function assertAllowedUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('Invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('Only http and https URLs are allowed');
  }

  // IPv6 literals come back bracketed from the URL parser
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname) !== 0 && isDisallowedAddress(hostname)) {
    throw new BlockedUrlError('URL resolves to a disallowed address');
  }

  return url;
}

// Validating inside the dispatcher's lookup hook means the address the socket
// actually connects to is the address that was checked — a rebinding DNS
// record cannot swap in a private address between validation and connect.
const safeDispatcher = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) {
          callback(err, '', 4);
          return;
        }
        const list = Array.isArray(addresses)
          ? addresses
          : [{ address: addresses as unknown as string, family: 4 }];
        if (
          list.length === 0 ||
          list.some((entry) => isDisallowedAddress(entry.address))
        ) {
          callback(
            new BlockedUrlError('URL resolves to a disallowed address'),
            '',
            4,
          );
          return;
        }
        if (options.all) {
          (callback as unknown as (e: null, a: typeof list) => void)(
            null,
            list,
          );
        } else {
          callback(null, list[0].address, list[0].family);
        }
      });
    },
  },
});

export interface SafeFetchResult {
  status: number;
  contentType: string | null;
  body: Buffer;
}

export interface SafeFetchOptions {
  /** Abort as soon as the body exceeds this many bytes. */
  maxBytes: number;
  /** Deadline for the whole operation, including reading the body. */
  timeoutMs: number;
  headers?: Record<string, string>;
}

/**
 * Fetch a caller-supplied URL with SSRF protections (see module docs).
 * Throws BlockedUrlError / ResponseTooLargeError / fetch errors.
 */
export async function safeFetchUrl(
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    let url = assertAllowedUrl(rawUrl);
    let response: Awaited<ReturnType<typeof undiciFetch>> | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await undiciFetch(url, {
        dispatcher: safeDispatcher,
        redirect: 'manual',
        signal: controller.signal,
        headers: options.headers,
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        break;
      }

      const location = response.headers.get('location');
      // Drain the redirect body so the connection can be reused
      await response.body?.cancel();
      response = null;
      if (!location) {
        throw new BlockedUrlError('Redirect without a Location header');
      }
      if (hop === MAX_REDIRECTS) {
        throw new BlockedUrlError('Too many redirects');
      }
      url = assertAllowedUrl(new URL(location, url).toString());
    }

    if (!response) {
      throw new BlockedUrlError('Too many redirects');
    }

    const chunks: Buffer[] = [];
    let total = 0;
    if (response.body) {
      for await (const chunk of response.body) {
        const buf = Buffer.from(chunk);
        total += buf.length;
        if (total > options.maxBytes) {
          controller.abort();
          throw new ResponseTooLargeError(
            `Response exceeded ${options.maxBytes} bytes`,
          );
        }
        chunks.push(buf);
      }
    }

    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      body: Buffer.concat(chunks),
    };
  } finally {
    clearTimeout(timeout);
  }
}
