// Pure parser for a collected edition's `collects` issue-list.
// Duplicated from apps/backend/src/comics/comic-issue-list.ts — KEEP IN SYNC.

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
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    for (const token of tokens) {
      const cleaned = token.replace(/^#\s*/, "").trim();
      const range = cleaned.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      const integer = cleaned.match(/^(\d+)$/);
      const decimal = cleaned.match(/^(\d+\.\d+)$/);

      if (range) {
        const a = parseInt(range[1]!, 10);
        const b = parseInt(range[2]!, 10);
        if (a <= b && b - a <= MAX_RANGE) {
          for (let i = a; i <= b; i++) presentSet.add(i);
        } else {
          unrecognized.push(token);
        }
      } else if (integer) {
        presentSet.add(parseInt(integer[1]!, 10));
      } else if (decimal) {
        presentSet.add(parseFloat(decimal[1]!));
      } else {
        unrecognized.push(token);
      }
    }
  }

  const present = [...presentSet].sort((a, b) => a - b);
  const presentInts = present.filter((n) => Number.isInteger(n));
  return { present, presentInts, unrecognized };
}

/** Collapse a list of integers into a compact display string: "#1–18, #26, #52". */
export function formatIssueList(nums: number[]): string {
  const ints = [...new Set(nums.filter((n) => Number.isInteger(n)))].sort(
    (a, b) => a - b,
  );
  const parts: string[] = [];
  let i = 0;
  while (i < ints.length) {
    let j = i;
    while (j + 1 < ints.length && ints[j + 1]! === ints[j]! + 1) j++;
    parts.push(i === j ? `#${ints[i]!}` : `#${ints[i]!}–${ints[j]!}`);
    i = j + 1;
  }
  return parts.join(", ");
}
