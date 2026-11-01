import { describe, it, expect } from "vitest";
import { htmlToText } from "../html-to-text";

describe("htmlToText", () => {
  it("turns a ComicVine volume description into readable text", () => {
    const html =
      '<p>Writer <a href="//www.comicvine.com/matt-fraction/4040-42266/" data-ref-id="4040-42266">Matt Fraction</a> and artist <a href="//www.comicvine.com/chip-zdarsky/4040-56003/" data-ref-id="4040-56003">Chip Zdarsky\'s</a> thirty-one issue comedy series.</p><h4>Companion Series</h4><ul><li><a href="/just-the-tips/4050-78556/" data-ref-id="4050-78556">Just the Tips</a></li></ul>';

    expect(htmlToText(html)).toBe(
      "Writer Matt Fraction and artist Chip Zdarsky's thirty-one issue comedy series. Companion Series Just the Tips",
    );
  });

  it("keeps a space between adjacent block elements", () => {
    expect(htmlToText("<p>One.</p><p>Two.</p>")).toBe("One. Two.");
    expect(htmlToText("Line one<br>Line two")).toBe("Line one Line two");
  });

  it("decodes entities", () => {
    expect(htmlToText("<p>Tom &amp; Jerry&nbsp;&quot;#1&quot;</p>")).toBe(
      'Tom & Jerry "#1"',
    );
  });

  it("drops figures, tables and scripts", () => {
    const html =
      '<figure data-align="right"><img src="x.jpg"><figcaption>Cover of #1</figcaption></figure><p>Story.</p><table><tr><th>Title</th></tr><tr><td>Vol 1</td></tr></table><script>alert(1)</script>';

    expect(htmlToText(html)).toBe("Story.");
  });

  it("leaves plain text unchanged", () => {
    expect(htmlToText("A plain summary.")).toBe("A plain summary.");
  });

  it("returns an empty string when nothing but markup remains", () => {
    expect(htmlToText("<p> </p><table><tr><td>x</td></tr></table>")).toBe("");
  });
});
