import * as path from 'path';

/**
 * Resolves `relativePath` against `rootPath` and guarantees the result stays
 * inside the root directory.
 *
 * Rejects:
 * - absolute input paths
 * - `..` segments that would escape the root
 * - resolution to the root directory itself
 *
 * Database-stored relative paths (audiobooks.filePath, audiobook_files.file_path,
 * ebooks.filePath, comics.filePath) normally originate from library scans, but
 * they can be polluted by crafted backup imports (ABS restore), so every
 * consumer that turns one into an absolute path for reading, streaming, or
 * deleting must go through this guard.
 *
 * This is pure path math and does not resolve symlinks; a hostile symlink
 * inside the library is a filesystem-level concern outside this helper's scope.
 */
export function resolveContainedPath(
  rootPath: string,
  relativePath: string,
): string {
  const resolvedRoot = path.resolve(rootPath);

  if (path.isAbsolute(relativePath)) {
    throw new Error(
      `Refusing to resolve absolute path '${relativePath}' outside the library root`,
    );
  }

  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);

  if (relative === '' || relative === '.') {
    throw new Error('Refusing to resolve to the library root itself');
  }

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Refusing to resolve path '${relativePath}' outside the library root`,
    );
  }

  return resolved;
}

/**
 * Validates that a relative path candidate is safe to persist in the database
 * (later resolved via {@link resolveContainedPath}). Rejects empty strings,
 * absolute paths, and anything containing `..` traversal segments.
 *
 * Backup archives (ABS restore) are untrusted input: their stored paths are
 * attacker-controlled and must never reach the database unchecked.
 */
export function isSafeRelativePath(value: string): boolean {
  if (!value || path.isAbsolute(value)) {
    return false;
  }
  const normalized = path.posix.normalize(value);
  return (
    normalized !== '' &&
    normalized !== '.' &&
    normalized !== '..' &&
    !normalized.startsWith('../') &&
    !path.isAbsolute(normalized)
  );
}
