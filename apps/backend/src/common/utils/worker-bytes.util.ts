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
