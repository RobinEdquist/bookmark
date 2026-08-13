import { describe, expect, it } from "vitest";
import { sanitizeBookContent } from "../sanitize-book-content";

const XHTML_TYPE = "application/xhtml+xml";
const HTML_TYPE = "text/html";

function xhtml(body: string, head = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Chapter</title>${head}</head>
<body>${body}</body>
</html>`;
}

describe("sanitizeBookContent", () => {
  describe("active content is removed", () => {
    it("removes script elements", () => {
      const result = sanitizeBookContent(
        xhtml(
          "<p>hi</p><script>window.top.location='https://evil.test'</script>",
        ),
        XHTML_TYPE,
      );
      expect(result).not.toContain("<script");
      expect(result).not.toContain("evil.test");
      expect(result).toContain("hi");
    });

    it("removes iframes including srcdoc payloads", () => {
      const result = sanitizeBookContent(
        xhtml(
          `<iframe srcdoc="&lt;script&gt;parent.top.document.title='pwned'&lt;/script&gt;"></iframe><p>text</p>`,
        ),
        XHTML_TYPE,
      );
      expect(result).not.toContain("<iframe");
      expect(result).not.toContain("srcdoc");
      expect(result).toContain("text");
    });

    it("removes inline event handlers", () => {
      const result = sanitizeBookContent(
        xhtml(`<p onclick="alert(1)" onmouseover="alert(2)">para</p>`),
        XHTML_TYPE,
      );
      expect(result).not.toContain("onclick");
      expect(result).not.toContain("onmouseover");
      expect(result).toContain("para");
    });

    it("removes javascript: links but keeps the link text", () => {
      const result = sanitizeBookContent(
        xhtml(`<a href="javascript:alert(document.domain)">note</a>`),
        XHTML_TYPE,
      );
      expect(result).not.toContain("javascript:");
      expect(result).toContain("note");
    });

    it("removes object and embed elements", () => {
      const result = sanitizeBookContent(
        xhtml(
          `<object data="https://evil.test/x.swf"></object><embed src="https://evil.test/x.svg"/>`,
        ),
        XHTML_TYPE,
      );
      expect(result).not.toContain("<object");
      expect(result).not.toContain("<embed");
    });

    it("removes forms and form controls", () => {
      const result = sanitizeBookContent(
        xhtml(
          `<form action="https://evil.test/collect"><input name="q"/><button>go</button></form>`,
        ),
        XHTML_TYPE,
      );
      expect(result).not.toContain("<form");
      expect(result).not.toContain("<input");
      expect(result).not.toContain("<button");
      expect(result).not.toContain("evil.test");
    });

    it("removes base elements that would rewrite relative URLs", () => {
      const result = sanitizeBookContent(
        xhtml("<p>x</p>", `<base href="https://evil.test/"/>`),
        XHTML_TYPE,
      );
      expect(result).not.toContain("<base");
    });

    it("removes script inside SVG", () => {
      const result = sanitizeBookContent(
        xhtml(
          `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1" height="1"/></svg>`,
        ),
        XHTML_TYPE,
      );
      expect(result).not.toContain("<script");
      expect(result).toContain("<rect");
    });

    it("removes javascript: xlink:href inside SVG", () => {
      const result = sanitizeBookContent(
        xhtml(
          `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>`,
        ),
        XHTML_TYPE,
      );
      expect(result).not.toContain("javascript:");
    });

    it("removes non-stylesheet link elements", () => {
      const result = sanitizeBookContent(
        xhtml(
          "<p>x</p>",
          `<link rel="preload" href="https://evil.test/x" as="script"/><link rel="import" href="https://evil.test/y"/>`,
        ),
        XHTML_TYPE,
      );
      expect(result).not.toContain("evil.test");
      expect(result).not.toContain("preload");
    });

    it("strips active content from text/html documents too", () => {
      const result = sanitizeBookContent(
        `<html><body><p>ok</p><iframe srcdoc="<script>alert(1)</script>"></iframe><script>alert(2)</script></body></html>`,
        HTML_TYPE,
      );
      expect(result).not.toContain("<script");
      expect(result).not.toContain("<iframe");
      expect(result).toContain("ok");
    });

    it("survives malformed XHTML without passing content through unsanitized", () => {
      const malformed = `<html><body><p>unclosed<script>alert(1)</script>`;
      const result = sanitizeBookContent(malformed, XHTML_TYPE);
      expect(result).not.toContain("<script>alert(1)</script>");
    });
  });

  describe("legitimate book content is preserved", () => {
    it("keeps paragraphs, headings, images, and structure", () => {
      const result = sanitizeBookContent(
        xhtml(
          `<h1>Title</h1><p class="para">Some <em>styled</em> text</p><img src="../images/cover.jpg" alt="cover"/>`,
        ),
        XHTML_TYPE,
      );
      expect(result).toContain("<h1>Title</h1>");
      expect(result).toContain("<em>styled</em>");
      expect(result).toContain("cover.jpg");
      expect(result).toContain('class="para"');
    });

    it("keeps stylesheet links and style elements", () => {
      const result = sanitizeBookContent(
        xhtml(
          "<p>x</p>",
          `<link rel="stylesheet" href="../styles/book.css"/><style>p { margin: 0; }</style>`,
        ),
        XHTML_TYPE,
      );
      expect(result).toContain("book.css");
      expect(result).toContain("<style>");
    });

    it("keeps epub:type semantics used for footnotes", () => {
      const result = sanitizeBookContent(
        xhtml(
          `<aside epub:type="footnote" id="fn1"><p>the note</p></aside><a href="#fn1" epub:type="noteref">1</a>`,
        ),
        XHTML_TYPE,
      );
      expect(result).toContain("footnote");
      expect(result).toContain("noteref");
      expect(result).toContain('href="#fn1"');
    });

    it("keeps internal relative links", () => {
      const result = sanitizeBookContent(
        xhtml(`<a href="chapter2.xhtml">next</a>`),
        XHTML_TYPE,
      );
      expect(result).toContain('href="chapter2.xhtml"');
    });

    it("keeps SVG images", () => {
      const result = sanitizeBookContent(
        xhtml(
          `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><image xlink:href="../images/fig.png" width="10" height="10"/></svg>`,
        ),
        XHTML_TYPE,
      );
      expect(result).toContain("fig.png");
    });
  });
});
