import { chunkText } from '../utils/text-chunker';

describe('chunkText', () => {
  it('keeps short text as a single chunk', () => {
    expect(chunkText('Hello world.', 100)).toEqual(['Hello world.']);
  });

  it('packs multiple paragraphs into one chunk when they fit', () => {
    const text = 'Para one.\n\nPara two.';
    expect(chunkText(text, 100)).toEqual(['Para one.\n\nPara two.']);
  });

  it('splits at paragraph boundaries when over the limit', () => {
    const p1 = 'a'.repeat(60) + '.';
    const p2 = 'b'.repeat(60) + '.';
    const chunks = chunkText(`${p1}\n\n${p2}`, 100);
    expect(chunks).toEqual([p1, p2]);
  });

  it('splits long paragraphs at sentence boundaries', () => {
    const s1 = 'First sentence is right here.';
    const s2 = 'Second sentence follows on.';
    const chunks = chunkText(`${s1} ${s2}`, 35);
    expect(chunks).toEqual([s1, s2]);
  });

  it('hard-splits single sentences longer than the limit at word boundaries', () => {
    const words = Array(30).fill('word').join(' ');
    const chunks = chunkText(words, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
      expect(chunk.startsWith(' ')).toBe(false);
      // No mid-word splits
      expect(chunk.split(/\s+/).every((w) => w === 'word')).toBe(true);
    }
  });

  it('never returns empty chunks', () => {
    expect(chunkText('\n\n  \n\n', 100)).toEqual([]);
  });
});
