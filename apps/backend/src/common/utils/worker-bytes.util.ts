/**
 * Copy binary data into a standalone ArrayBuffer that can safely be transferred
 * to another worker. Node Buffers often share a pooled backing slab; directly
 * transferring that slab can detach unrelated Buffers and send unused bytes.
 */
export function copyToTransferableBytes(
  data: Uint8Array,
): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(data);
}

/** Create a zero-copy Buffer view over bytes received from a worker. */
export function bytesToBuffer(data: Uint8Array): Buffer {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

/** Return the transferable backing store for standalone worker bytes. */
export function transferListFor(
  data: Uint8Array | null | undefined,
): ArrayBuffer[] {
  return data?.buffer instanceof ArrayBuffer ? [data.buffer] : [];
}

/**
 * Transfer list for a worker task response. The metadata workers return cover
 * bytes either as `{ data }` or nested as `{ cover: { data } }`; this owns
 * that shape-sniffing once instead of each worker hand-rolling it.
 */
export function responseTransferList(result: unknown): ArrayBuffer[] {
  if (!result || typeof result !== 'object') return [];
  const { data, cover } = result as { data?: unknown; cover?: unknown };
  if (data instanceof Uint8Array) return transferListFor(data);
  if (cover && typeof cover === 'object') {
    const coverData = (cover as { data?: unknown }).data;
    if (coverData instanceof Uint8Array) return transferListFor(coverData);
  }
  return [];
}
