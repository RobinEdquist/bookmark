/**
 * Format a file size in bytes to a human-readable string.
 *
 * Examples:
 * - 512 -> "512 B"
 * - 2048 -> "2.0 KB"
 * - 5242880 -> "5.0 MB"
 * - 3221225472 -> "3.00 GB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
