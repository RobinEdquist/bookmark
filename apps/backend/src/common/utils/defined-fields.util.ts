/**
 * The fields of a request DTO that the client actually sent.
 *
 * The global ValidationPipe (`transform: true`) hands handlers a DTO class
 * instance. With ES2022+ class fields every declared property exists on that
 * instance, holding `undefined` when the client left it out, so `Object.keys`
 * or a spread of the DTO lists fields nobody sent.
 */
export function definedFields<T extends object>(dto: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(dto).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
