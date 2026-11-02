import { describe, it, expect } from "vitest";
import { render, screen } from "../../../__test-utils__/render";
import { ComicDescription } from "../comic-description";

describe("ComicDescription", () => {
  it("renders HTML that needs no sanitizing as HTML", () => {
    // Shortened from ComicVine's summary of The Amazing Spider-Man (2015) #1.
    // DOMPurify returns it unchanged, which once sent it down a plain-text path.
    const html =
      "<p><em>Spider-Man has gone global!</em></p><h2>Contents</h2><ul><li>Worldwide</li><li>The Last Time</li></ul><table><thead><tr><th>Cover</th><th>Creator(s)</th></tr></thead><tbody><tr><td>Regular Cover</td><td>Alex Ross</td></tr></tbody></table>";

    const { container } = render(<ComicDescription html={html} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Contents" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "Alex Ross" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("<");
  });

  it("renders plain text as text", () => {
    render(<ComicDescription html="Peter & MJ face Jigsaw." />);

    expect(screen.getByText("Peter & MJ face Jigsaw.")).toBeInTheDocument();
  });

  it("strips scripts and event handlers", () => {
    const { container } = render(
      <ComicDescription
        html={'<p onclick="alert(1)">Hi</p><script>alert(2)</script>'}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect(screen.getByText("Hi")).toBeInTheDocument();
  });
});
