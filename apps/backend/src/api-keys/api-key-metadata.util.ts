/**
 * Extracts the lastIp value recorded in an api_key row's JSON metadata column.
 */
export function parseLastIp(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (parsed && typeof parsed === 'object' && 'lastIp' in parsed) {
      const ip = (parsed as Record<string, unknown>).lastIp;
      return typeof ip === 'string' && ip.length > 0 ? ip : null;
    }
  } catch {
    // Invalid JSON, treat as no recorded IP
  }
  return null;
}
