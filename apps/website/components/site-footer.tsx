import Link from "next/link";
import { GITHUB_URL } from "./site-header";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer-inner">
        <div>
          <span className="wordmark-text" style={{ fontSize: "1.5rem" }}>
            Bookmark
          </span>
          <p style={{ marginTop: "0.6rem", maxWidth: "36ch" }}>
            A self-hosted home for your audiobooks, ebooks, and comics. MIT licensed.
          </p>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <a href={GITHUB_URL}>GitHub</a>
          <Link href="/get-started/">Get started</Link>
          <a href={`${GITHUB_URL}#configuration`}>Configuration</a>
        </nav>
        <p style={{ maxWidth: "40ch", fontSize: "0.8125rem" }}>
          Book and comic metadata thanks to Goodreads, Hardcover, Audnexus, and Comic Vine. The covers shown on this
          page are fictional.
        </p>
      </div>
    </footer>
  );
}
