import Link from "next/link";
import { BOOKS, COMICS, Cover } from "../components/covers";
import { DesktopMockup } from "../components/desktop-mockup";
import { NeonSign } from "../components/neon-sign";
import { PhoneLibrary, PhonePlayer } from "../components/phone-mockup";
import { PlayerCloseup } from "../components/player-closeup";
import { Reveal } from "../components/reveal";
import { GITHUB_URL } from "../components/site-header";
import { SyncDemo } from "../components/sync-demo";
import { Terminal } from "../components/terminal";
import { ThemeDemo } from "../components/theme-demo";

const WAVE = [30, 55, 80, 45, 70, 95, 60, 35, 78, 50, 88, 42, 65, 32];

export default function Home() {
  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="shell hero">
        <NeonSign />
        <h1>
          A home for
          <span className="hero-script">your audiobooks</span>
        </h1>
        <p className="hero-lede">
          Bookmark is a self-hosted server for your audiobooks, with room on the
          same shelf for ebooks and comics. It streams to the browser and native
          mobile apps, keeps your progress in sync across devices, and never
          modifies your files.
        </p>
        <div className="hero-ctas">
          <Link href="/get-started/" className="btn btn-neon">
            Get started
          </Link>
          <a href={GITHUB_URL} className="btn btn-quiet">
            View on GitHub
          </a>
        </div>
        <p className="hero-fineprint">
          docker compose up -d · MIT licensed · open source
        </p>

        <div className="hero-stage">
          <DesktopMockup />
          <PhonePlayer className="phone-front" />
        </div>
      </section>

      {/* --------------------------------------------------------- library */}
      <section className="shell section" id="library">
        <div className="fold">
          <Reveal>
            <p className="kicker kicker-magenta">The library</p>
            <h2 className="section-title">Covers, chapters, and metadata</h2>
            <p className="section-lede">
              Point Bookmark at the folders you already have. It scans covers,
              chapters, and embedded tags from your files; descriptions,
              ratings, and series info can be matched from Goodreads, Hardcover,
              Audible, and Comic Vine. Libraries are mounted read-only and never
              modified.
            </p>
            <ul className="feature-list">
              <li>
                <strong>Audible and iTunes search.</strong> Look up a book from
                the edit dialog to fill in the description, narrators, genres,
                and series order.
              </li>
              <li>
                <strong>Goodreads and Hardcover ratings.</strong> Community
                ratings show on each book. Sort the library by rating, or browse
                the top list.
              </li>
              <li>
                <strong>Metadata priority.</strong> When sources disagree, a
                configurable order decides which wins: manual edits, embedded
                tags, or matched data.
              </li>
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <div className="shelf">
              {[...BOOKS.slice(2, 9)].map((book) => (
                <figure key={book.title}>
                  <Cover book={book} />
                  <figcaption>
                    <div className="dm-book-title">{book.title}</div>
                    <div className="dm-book-meta">{book.author}</div>
                  </figcaption>
                </figure>
              ))}
              <figure>
                <Cover book={COMICS[0]!} issue={COMICS[0]!.issue} />
                <figcaption>
                  <div className="dm-book-title">{COMICS[0]!.title}</div>
                  <div className="dm-book-meta">Issue 12</div>
                </figcaption>
              </figure>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- player */}
      <section className="shell section" id="listening">
        <div className="fold-reverse fold">
          <Reveal>
            <p className="kicker kicker-cyan">The player</p>
            <h2 className="section-title">A player built for audiobooks</h2>
            <ul className="feature-list">
              <li>
                <strong>Playback speed.</strong> Anywhere from 0.5× to 2× on the
                web. The apps adjust in 0.05× steps.
              </li>
              <li>
                <strong>Sleep timer.</strong> Set it in minutes, or have it stop
                at the end of the chapter.
              </li>
              <li>
                <strong>Skip controls.</strong> Jump back 15 seconds or ahead 30
                with one tap. The apps let you set your own intervals.
              </li>
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <PlayerCloseup />
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------ sync */}
      <section className="shell section-tight">
        <Reveal>
          <p className="kicker kicker-magenta">Sync</p>
          <h2 className="section-title">Progress syncs across devices</h2>
          <p className="section-lede">
            Your position saves to your server every few seconds while you
            listen. Pause on your phone, press play at your desk, and continue
            from the same sentence. Live updates arrive over WebSocket; no
            refresh required.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div style={{ marginTop: "3rem" }}>
            <SyncDemo />
          </div>
        </Reveal>
      </section>

      {/* ------------------------------------------------------------ apps */}
      <section className="shell section" id="apps">
        <div className="fold">
          <Reveal>
            <p className="kicker kicker-cyan">Mobile apps</p>
            <h2 className="section-title">
              Native apps for iPhone and Android
            </h2>
            <p className="section-lede">
              Real native apps, not a wrapped website, with the whole library
              available offline.
            </p>
            <p className="badge-soon">Public beta coming soon</p>
            <ul className="feature-list">
              <li>
                <strong>Offline downloads.</strong> Download books to the phone
                and listen in airplane mode. Progress reconciles once you are
                back online.
              </li>
              <li>
                <strong>Pairing.</strong> Scan a QR code from the web app to
                sign in, or enter your server address and use your account,
                including single sign-on.
              </li>
              <li>
                <strong>iPad support.</strong> A sidebar layout that uses the
                full screen.
              </li>
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <div className="phone-duo">
              <PhonePlayer className="phone-back" />
              <PhoneLibrary className="phone-front" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------------------- formats */}
      <section className="shell section-tight" id="formats">
        <Reveal>
          <p className="kicker kicker-magenta">Formats</p>
          <h2 className="section-title">Audiobooks, ebooks, and comics</h2>
        </Reveal>
        <div className="format-cols">
          <Reveal>
            <div className="format-col">
              <div className="format-visual">
                <Cover book={BOOKS[9]!} tall className="ebook-cover" />
                <span className="format-tag">OPDS feed</span>
              </div>
              <h3>Ebooks</h3>
              <p>
                EPUBs are scanned and readable right in the browser. They are
                also served over OPDS, so you can keep using the reader app you
                already prefer.
              </p>
              <div className="format-tags">
                <span className="format-tag">EPUB</span>
              </div>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="format-col">
              <div className="format-visual fan">
                {COMICS.map((comic) => (
                  <Cover
                    key={comic.title}
                    book={comic}
                    issue={comic.issue}
                    tall
                  />
                ))}
              </div>
              <h3>Comics</h3>
              <p>
                Series and issues, including TPBs, omnibuses, and one-shots.
                Browse, organize, and download your archives, or read them in a
                comic app over OPDS.
              </p>
              <div className="format-tags">
                <span className="format-tag">CBZ</span>
                <span className="format-tag">CBR</span>
                <span className="format-tag">PDF</span>
                <span className="format-tag">OPDS</span>
              </div>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="format-col">
              <div className="format-visual">
                <div className="tts-wave" aria-hidden>
                  {WAVE.map((h, i) => (
                    <span
                      key={i}
                      style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }}
                    />
                  ))}
                </div>
              </div>
              <h3>AI narration</h3>
              <p>
                Bookmark can narrate an ebook into an M4B audiobook, chapters
                included, using any OpenAI-compatible text-to-speech server. A
                ready-to-run engine ships in the compose file.
              </p>
              <div className="format-tags">
                <span className="format-tag">EPUB in</span>
                <span className="format-tag">M4B out</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------------------- yours */}
      <section className="shell section" id="yours">
        <div className="fold-reverse fold">
          <Reveal>
            <p className="kicker kicker-cyan">Accounts</p>
            <h2 className="section-title">Multiple users and permissions</h2>
            <ul className="feature-list">
              <li>
                <strong>Per-user progress.</strong> Every account has its own
                progress, lists, stats, and preferences.
              </li>
              <li>
                <strong>Permissions and tag filters.</strong> Control who can
                edit metadata or upload, and use tag filters to hide certain
                content from certain accounts.
              </li>
              <li>
                <strong>OIDC, API keys, and a REST API.</strong> Optional OpenID
                Connect single sign-on, per-user API keys, and a REST API
                documented with Swagger.
              </li>
              <li>
                <strong>Themes.</strong> Sixteen accent colors and thirteen
                themes, from pure-black Pitch to light Silver, in English and
                Swedish.
              </li>
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <ThemeDemo />
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------------- get started */}
      <section className="shell section" id="get-started">
        <div className="fold">
          <Reveal>
            <p className="kicker kicker-magenta">Self-hosting</p>
            <h2 className="section-title">Install with Docker Compose</h2>
            <p className="section-lede">
              One image, database included. Copy the config template, point it
              at your media folders, and start it with a single command. The
              first account you create becomes the admin.
            </p>
            <div
              className="hero-ctas"
              style={{ justifyContent: "flex-start", marginTop: "2rem" }}
            >
              <Link href="/get-started/" className="btn btn-neon">
                Read the guide
              </Link>
              <a
                href={GITHUB_URL}
                className="link-arrow"
                style={{ alignSelf: "center" }}
              >
                Browse the source
              </a>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <Terminal
              title="~ on your-server"
              copyText={
                "git clone https://github.com/RobinEdquist/bookmark.git\ncd bookmark\ncp example.env .env\ndocker compose up -d"
              }
            >
              <span className="t-prompt">$ </span>git clone
              https://github.com/RobinEdquist/bookmark.git{"\n"}
              <span className="t-prompt">$ </span>cd bookmark{"\n"}
              <span className="t-prompt">$ </span>cp example.env .env{"\n"}
              <span className="t-comment">
                # point .env at your media folders, then:
              </span>
              {"\n"}
              <span className="t-prompt">$ </span>docker compose up -d{"\n"}
              <span className="t-accent">
                ➜ Bookmark is listening at http://localhost:3001
              </span>
            </Terminal>
          </Reveal>
        </div>
      </section>
    </>
  );
}
