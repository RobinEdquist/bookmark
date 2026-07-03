// Pure text chunking for TTS requests. Chunks are kept well under the size
// where CPU synthesis time would approach request timeouts, and splits
// happen at natural pauses (paragraphs, then sentences, then words) so
// stitched audio has no mid-word seams.

export const DEFAULT_CHUNK_SIZE = 3000;

const SENTENCE_BOUNDARY = /(?<=[.!?…]["'”’)\]]?)\s+/;

function splitLongSentence(sentence: string, maxLength: number): string[] {
  const parts: string[] = [];
  let remaining = sentence;
  while (remaining.length > maxLength) {
    // Prefer the last word boundary before the limit
    let cut = remaining.lastIndexOf(' ', maxLength);
    if (cut <= 0) cut = maxLength;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

function splitParagraph(paragraph: string, maxLength: number): string[] {
  if (paragraph.length <= maxLength) return [paragraph];
  const pieces: string[] = [];
  for (const sentence of paragraph.split(SENTENCE_BOUNDARY)) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxLength) {
      pieces.push(trimmed);
    } else {
      pieces.push(...splitLongSentence(trimmed, maxLength));
    }
  }
  return pieces;
}

/**
 * Split plain text (paragraphs separated by blank lines) into chunks of at
 * most `maxLength` characters, breaking at paragraph, then sentence, then
 * word boundaries.
 */
export function chunkText(
  text: string,
  maxLength: number = DEFAULT_CHUNK_SIZE,
): string[] {
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = '';
  };

  for (const paragraph of text.split(/\n{2,}/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    for (const piece of splitParagraph(trimmed, maxLength)) {
      // +2 accounts for the paragraph separator we join with
      if (current && current.length + piece.length + 2 > maxLength) {
        flush();
      }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }

  flush();
  return chunks;
}
