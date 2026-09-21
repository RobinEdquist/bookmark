import { describe, expect, it, vi } from "vitest";
import { ProgressSaver } from "../progress-saver";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const ok = () => new Response(null, { status: 200 });

describe("player progress saves", () => {
  it("uses authenticated PATCH with integer absolute position and keepalive", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const saver = new ProgressSaver(send);
    saver.setOwner("a");
    await saver.save("a", "book", 5400.9);
    expect(send).toHaveBeenCalledWith(
      "/api/progress/book",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json", "X-Bookmark-User": "a" },
        body: '{"position":5400}',
      }),
    );
  });

  it.each(["http", "network"])(
    "retains a failed %s sample for reconnect",
    async (kind) => {
      const send = vi.fn<typeof fetch>();
      if (kind === "http")
        send.mockResolvedValueOnce(new Response(null, { status: 503 }));
      else send.mockRejectedValueOnce(new TypeError("offline"));
      send.mockResolvedValue(ok());
      const saver = new ProgressSaver(send);
      saver.setOwner("a");
      await saver.save("a", "book", 12);
      await saver.retry();
      await saver.retry();
      expect(send).toHaveBeenCalledTimes(2);
    },
  );

  it("serializes sends and preserves a rewind made during an older upload", async () => {
    const first = deferred<Response>();
    const send = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(ok());
    const saver = new ProgressSaver(send);
    saver.setOwner("a");
    const draining = saver.save("a", "book", 100);
    void saver.save("a", "book", 40);
    expect(send).toHaveBeenCalledTimes(1);
    first.resolve(ok());
    await draining;
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[1]?.body).toBe('{"position":40}');
  });

  it("drops account A intent on account change and ignores its late acknowledgement", async () => {
    const first = deferred<Response>();
    const send = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(ok());
    const saver = new ProgressSaver(send);
    saver.setOwner("a");
    const draining = saver.save("a", "same-book", 100);
    saver.setOwner("b");
    await saver.save("a", "same-book", 200);
    await saver.save("b", "same-book", 3);
    first.resolve(ok());
    await draining;
    await saver.retry();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(send.mock.calls[1]?.[1]?.body).toBe('{"position":3}');
  });
});
