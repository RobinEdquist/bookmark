import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  userEvent,
  waitFor,
} from "../../../__test-utils__/render";
import { AddEbookToGroupDialog } from "../add-ebook-to-group-dialog";
import { AddToEbookGroupDialog } from "../add-to-ebook-group-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ebooks = Array.from({ length: 50 }, (_, i) => ({
  id: `ebook-${i}`,
  title: `Book ${i}`,
  authors: [],
}));
const groups = Array.from({ length: 50 }, (_, i) => ({
  id: `group-${i}`,
  name: `Group ${i}`,
  ebookCount: 1,
}));
const nextBook = { id: "next-book", title: "Next page book", authors: [] };
const nextGroup = { id: "next-group", name: "Next page group", ebookCount: 1 };

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function mockPages(failNextPage = false) {
  let failed = false;
  fetchMock.mockImplementation(async (input, init) => {
    if (init?.method === "POST") return Response.json({ success: true });
    const url = new URL(String(input), "http://localhost");
    const offset = Number(url.searchParams.get("offset"));
    if (offset === 50 && failNextPage && !failed) {
      failed = true;
      return new Response("Unavailable", { status: 503 });
    }
    return url.pathname.endsWith("/groups")
      ? Response.json({
          groups: offset === 50 ? [nextGroup] : groups,
          total: 51,
        })
      : Response.json({
          ebooks: offset === 50 ? [nextBook] : ebooks,
          total: 51,
        });
  });
}

describe("ebook group picker pagination", () => {
  it("can add a later ebook even when every first-page result is already a member", async () => {
    mockPages();
    const user = userEvent.setup();
    const close = vi.fn();
    render(
      <AddEbookToGroupDialog
        open
        onOpenChange={close}
        groupId="group"
        memberIds={ebooks.map((b) => b.id)}
      />,
    );
    await screen.findByRole("button", { name: "groups.loadMore" });
    expect(screen.queryByText("groups.noEbooks")).not.toBeInTheDocument();
    expect(screen.queryByText("Book 0")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "groups.loadMore" }));
    await user.click(
      await screen.findByRole("button", { name: "Next page book" }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("offset=50"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ebooks/groups/group/ebooks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ebookId: "next-book" }),
      }),
    );
  });

  it("loads and selects a group beyond the first 50 results", async () => {
    mockPages();
    const user = userEvent.setup();
    const close = vi.fn();
    render(<AddToEbookGroupDialog open onOpenChange={close} ebookId="book" />);
    await user.click(
      await screen.findByRole("button", { name: "groups.loadMore" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Next page group/ }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ebooks/groups/next-group/ebooks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ebookId: "book" }),
      }),
    );
  });

  it.each(["ebooks", "groups"])(
    "retries a failed next page without losing loaded %s",
    async (kind) => {
      mockPages(true);
      const user = userEvent.setup();
      render(
        kind === "ebooks" ? (
          <AddEbookToGroupDialog
            open
            onOpenChange={vi.fn()}
            groupId="group"
            memberIds={[]}
          />
        ) : (
          <AddToEbookGroupDialog open onOpenChange={vi.fn()} ebookId="book" />
        ),
      );
      await user.click(
        await screen.findByRole("button", { name: "groups.loadMore" }),
      );
      await screen.findByRole("alert");
      expect(
        screen.getByText(kind === "ebooks" ? "Book 0" : "Group 0"),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "groups.retry" }));
      await screen.findByText(
        kind === "ebooks" ? "Next page book" : "Next page group",
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "groups.loadMore" }),
      ).not.toBeInTheDocument();
    },
  );
});
