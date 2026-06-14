/**
 * Returns the URL only if it is a safe http(s) URL, otherwise null.
 *
 * Guards against `javascript:` / `data:` / other-scheme XSS when rendering
 * external or untrusted URLs as an anchor `href`. Comic metadata is sourced
 * from user-supplied files (ComicInfo.xml `<Web>`) and third-party APIs
 * (ComicVine `site_detail_url`), so any such URL must be scheme-checked
 * before it is used in `href`.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}
