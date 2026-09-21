/** In-page pending intent. A sample is removed only after that sample is acknowledged. */
export class ProgressSaver {
  private owner: string | null = null;
  private pending = new Map<string, number>();
  private revision = new Map<string, number>();
  private running: Promise<void> | null = null;
  private generation = 0;
  private controller = new AbortController();

  constructor(
    private readonly send: typeof fetch = (...args) => fetch(...args),
  ) {}

  setOwner(owner: string | null) {
    if (owner === this.owner) return;
    this.controller.abort();
    this.controller = new AbortController();
    this.owner = owner;
    this.generation++;
    this.pending.clear();
    this.revision.clear();
    this.running = null;
  }

  save(owner: string | null, book: string, position: number): Promise<void> {
    if (
      !owner ||
      owner !== this.owner ||
      !Number.isFinite(position) ||
      position < 0
    )
      return Promise.resolve();
    this.pending.set(book, Math.floor(position));
    this.revision.set(book, (this.revision.get(book) ?? 0) + 1);
    return this.retry();
  }

  retry(): Promise<void> {
    if (!this.owner) return Promise.resolve();
    if (this.running) return this.running;
    const generation = this.generation;
    const signal = this.controller.signal;
    this.running = this.drain(generation, signal).finally(() => {
      if (generation === this.generation) this.running = null;
    });
    return this.running;
  }

  private async drain(generation: number, signal: AbortSignal) {
    // One failed book must not starve other books, or spin on a failed request.
    const failed = new Set<string>();
    while (generation === this.generation) {
      const entry = [...this.pending].find(([book]) => !failed.has(book));
      if (!entry) return;
      const [book, position] = entry;
      const revision = this.revision.get(book);
      try {
        const response = await this.send(
          `/api/progress/${encodeURIComponent(book)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "X-Bookmark-User": this.owner!,
            },
            credentials: "include",
            body: JSON.stringify({ position }),
            keepalive: true,
            signal,
          },
        );
        if (generation !== this.generation) return;
        if (!response.ok) {
          failed.add(book);
        } else if (revision === this.revision.get(book)) {
          this.pending.delete(book);
        }
      } catch {
        failed.add(book);
      }
    }
  }
}
