export interface OpenApiOperation {
  security?: Record<string, unknown>[];
}

/** OPDS routes can also advertise cookie or Bearer authentication alternatives. */
export function supportsBasicAuth(operation: OpenApiOperation): boolean {
  return (operation.security ?? []).some(
    (requirement) => 'basic' in requirement,
  );
}
