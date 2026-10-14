export const transferStates = [
  'downloading',
  'paused',
  'stalled',
  'queued',
  'checking',
  'moving',
  'completed',
  'error',
  'not_found',
  'unknown',
] as const;
export type TransferState = (typeof transferStates)[number];
export function transferProgress(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : null;
}

/** Unknown source states never establish an active or completed transfer. */
export function transferState(value: unknown): TransferState {
  return transferStates.includes(value as TransferState)
    ? (value as TransferState)
    : 'unknown';
}
