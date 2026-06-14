// Pure parser for a collected edition's `collects` issue-list.
// Grammar: comma-separated tokens; each token is an integer (`12`, `#12`),
// a decimal (`1.5`), or an integer range (`1-18`, `1 – 18`). Leading `#` and
// surrounding whitespace tolerated. Anything else is "unrecognized".
// Duplicated in apps/web/lib/comic-issue-list.ts — KEEP IN SYNC.

export interface ParsedCollects {
  present: number[]; // sorted, unique (ints + decimals)
  presentInts: number[]; // sorted, unique integer members only
  unrecognized: string[]; // raw tokens that did not parse
}

const MAX_RANGE = 5000;

export function parseCollects(input: string | null | undefined): ParsedCollects {
  const presentSet = new Set<number>();
  const unrecognized: string[] = [];

  if (input) {
    const tokens = input
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    for (const token of tokens) {
      const cleaned = token.replace(/^#\s*/, '').trim();
      const range = cleaned.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      const integer = cleaned.match(/^(\d+)$/);
      const decimal = cleaned.match(/^(\d+\.\d+)$/);

      if (range) {
        const a = parseInt(range[1], 10);
        const b = parseInt(range[2], 10);
        if (a <= b && b - a <= MAX_RANGE) {
          for (let i = a; i <= b; i++) presentSet.add(i);
        } else {
          unrecognized.push(token);
        }
      } else if (integer) {
        presentSet.add(parseInt(integer[1], 10));
      } else if (decimal) {
        presentSet.add(parseFloat(decimal[1]));
      } else {
        unrecognized.push(token);
      }
    }
  }

  const present = [...presentSet].sort((a, b) => a - b);
  const presentInts = present.filter((n) => Number.isInteger(n));
  return { present, presentInts, unrecognized };
}
