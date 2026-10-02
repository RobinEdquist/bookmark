import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  userEvent,
  waitFor,
} from "../../../__test-utils__/render";
import { WantedBookForm } from "../wanted-book-form";

describe("Request an unavailable book", () => {
  it("submits book intent without requiring a release and uses the selected medium", async () => {
    const user = userEvent.setup();
    const onRequest = vi.fn().mockResolvedValue({ id: "request-1" });
    render(
      <WantedBookForm
        initialTitle="The Book"
        contentType="all"
        onRequest={onRequest}
        isRequesting={false}
      />,
    );
    await user.click(screen.getByText("wanted.title"));
    await user.type(screen.getByLabelText("wanted.author"), "An Author");
    await user.click(screen.getByRole("radio", { name: "badge.ebook" }));
    await user.click(screen.getByRole("button", { name: "button.request" }));
    await waitFor(() =>
      expect(onRequest).toHaveBeenCalledWith({
        title: "The Book",
        author: "An Author",
        contentType: "ebook",
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("wanted.bookTitle")).toHaveValue(""),
    );
  });

  it("retains the draft after a failed request and respects a medium-specific view", async () => {
    const user = userEvent.setup();
    const onRequest = vi.fn().mockResolvedValue(undefined);
    render(
      <WantedBookForm
        initialTitle="Keep this title"
        contentType="audiobooks"
        onRequest={onRequest}
        isRequesting={false}
      />,
    );
    await user.click(screen.getByText("wanted.title"));
    await user.click(screen.getByRole("button", { name: "button.request" }));
    await waitFor(() =>
      expect(onRequest).toHaveBeenCalledWith({
        title: "Keep this title",
        author: undefined,
        contentType: "audiobook",
      }),
    );
    expect(screen.getByLabelText("wanted.bookTitle")).toHaveValue(
      "Keep this title",
    );
  });
});
