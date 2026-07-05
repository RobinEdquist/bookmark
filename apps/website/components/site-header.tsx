import Image from "next/image";
import Link from "next/link";
import { GitHub } from "./icons";

const GITHUB_URL = "https://github.com/RobinEdquist/bookmark";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell site-header-inner">
        <Link href="/" className="wordmark" aria-label="Bookmark home">
          <Image src="/bookmark-icon.png" alt="" width={64} height={64} priority />
          <span className="wordmark-text">Bookmark</span>
        </Link>
        <nav className="site-nav" aria-label="Site">
          <Link href="/#library" className="nav-link-optional">
            Features
          </Link>
          <Link href="/#apps" className="nav-link-optional">
            Mobile apps
          </Link>
          <a href={GITHUB_URL} aria-label="Bookmark on GitHub" style={{ display: "inline-flex" }}>
            <GitHub width={20} height={20} />
          </a>
          <Link href="/get-started/" className="btn btn-neon">
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

export { GITHUB_URL };
