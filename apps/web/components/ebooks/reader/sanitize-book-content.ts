import DOMPurify from "dompurify";

/**
 * Sanitizer for untrusted book content (SECURITY-REVIEW SAV-02).
 *
 * Threat model: foliate-js renders chapters in iframes carrying both
 * `allow-scripts` (needed for a WebKit event bug) and `allow-same-origin`
 * (blob: documents share the app origin, which foliate needs to drive
 * pagination). That combination means ANY active content that survives into
 * the chapter document runs with same-origin access to the application — so
 * book content must be made completely inert before it reaches the iframe.
 *
 * A strict allowlist (DOMPurify) replaces the previous script/on*-only
 * stripper, which still let through iframe srcdoc documents, `javascript:`
 * URLs, object/embed, forms, and `<base>` rewrites. DOMPurify's defaults
 * already remove script/iframe/object/embed/base/meta, all event handlers,
 * and javascript:/vbscript: URLs across HTML, SVG and MathML; the config
 * below additionally:
 *
 * - forbids form controls (books must not submit data anywhere);
 * - allows `<link>` again but only with rel="stylesheet" (EPUB chapters need
 *   their stylesheets; import/preload/prefetch rels stay banned);
 * - keeps EPUB semantics (`epub:type`) used for footnotes/landmarks.
 *
 * The document is parsed with the chapter's real content type and sanitized
 * IN_PLACE so the chapter keeps its exact document structure (DOMPurify's
 * string mode would wrap whole XHTML documents in a second <html> shell).
 * Malformed XHTML is re-parsed as text/html — lenient, but still sanitized —
 * and anything that cannot be parsed at all is dropped (fail closed).
 *
 * An isolated DOMPurify instance is used so the reader-specific hook cannot
 * leak into the app's other sanitize calls (book/comic descriptions).
 */

const FORBIDDEN_TAGS = [
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "option",
  "optgroup",
  "fieldset",
  "legend",
  "datalist",
  "output",
  "dialog",
];

const SANITIZE_CONFIG = {
  IN_PLACE: true,
  FORBID_TAGS: FORBIDDEN_TAGS,
  ADD_TAGS: ["link"],
  ADD_ATTR: ["epub:type", "epub:prefix"],
};

type Purifier = ReturnType<typeof DOMPurify>;

let purifier: Purifier | null = null;

function getPurifier(): Purifier {
  if (!purifier) {
    purifier = DOMPurify(window);
    purifier.addHook("uponSanitizeElement", (node, data) => {
      if (data.tagName === "link") {
        const element = node as Element;
        const rel = element.getAttribute?.("rel")?.trim().toLowerCase();
        if (rel !== "stylesheet") {
          element.parentNode?.removeChild(element);
        }
      }
    });
  }
  return purifier;
}

function parseDocument(data: string, type: string): Document | null {
  try {
    const doc = new DOMParser().parseFromString(
      data,
      type as DOMParserSupportedType,
    );
    // XML parsers surface syntax errors as an embedded <parsererror> element
    if (!doc.documentElement || doc.querySelector("parsererror")) {
      return null;
    }
    return doc;
  } catch {
    return null;
  }
}

/**
 * Sanitize a chapter document before foliate-js turns it into a blob URL.
 * Fails closed: content that cannot be parsed at all is dropped entirely
 * rather than passed through.
 */
export function sanitizeBookContent(data: string, type: string): string {
  try {
    // Malformed XHTML falls back to the forgiving HTML parser, so broken
    // books stay readable while still passing through the sanitizer.
    const doc = parseDocument(data, type) ?? parseDocument(data, "text/html");
    if (!doc) {
      return "";
    }

    getPurifier().sanitize(doc.documentElement, SANITIZE_CONFIG);
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return "";
  }
}
