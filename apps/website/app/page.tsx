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
          Press play on
          <span className="hero-script">your own server</span>
        </h1>
        <p className="hero-lede">
          Bookmark is a self-hosted home for your audiobooks, with room on the same shelf for ebooks and comics. It
          fills in covers, metadata, and ratings on its own, the player is built around how people actually listen,
          and your progress follows you everywhere.
        </p>
        <div className="hero-ctas">
          <Link href="/get-started/" className="btn btn-neon">
            Get started
          </Link>
          <a href={GITHUB_URL} className="btn btn-quiet">
            View on GitHub
          </a>
        </div>
        <p className="hero-fineprint">docker compose up -d · MIT licensed · your files stay yours</p>

        <div className="hero-stage">
          <DesktopMockup />
          <PhonePlayer className="phone-front" />
        </div>
      </section>

      {/* --------------------------------------------------------- library */}
      <section className="shell section" id="library">
        <div className="fold">
          <Reveal>
            <p className="kicker kicker-magenta">Metadata</p>
            <h2 className="section-title">A library that fills itself in</h2>
            <p className="section-lede">
              Point Bookmark at the folders you already have. Covers and chapters come out of your files; the rest
              syncs from Goodreads, Hardcover, Audnexus, and Comic Vine. Your originals are mounted read-only and
              never rewritten.
            </p>
            <ul className="feature-list">
              <li>
                <strong>Kept in sync, not fetched once.</strong> A background sync fills in descriptions, narrators,
                genres, and series order as your library grows.
              </li>
              <li>
                <strong>Ratings from Goodreads and Hardcover.</strong> Community ratings sync along with the rest of
                the metadata. Sort the library by them, or browse the top list.
              </li>
              <li>
                <strong>Fix anything by hand.</strong> Every field is editable, and a match dialog pulls better
                candidates when the automatic guess is wrong.
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
            <h2 className="section-title">Built around how people actually listen</h2>
            <ul className="feature-list">
              <li>
                <strong>Playback speed.</strong> Anywhere from 0.5× to 2× on the web. The apps adjust in 0.05× steps.
              </li>
              <li>
                <strong>Sleep timer.</strong> Set it in minutes, or have it stop at the end of the chapter.
              </li>
              <li>
                <strong>Skip controls.</strong> Jump back 15 seconds or ahead 30 with one tap. The apps let you set
                your own intervals.
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
          <p className="kicker kicker-magenta">Progress sync</p>
          <h2 className="section-title">Pick up exactly where you left off</h2>
          <p className="section-lede">
            Your position saves to your server every few seconds while you listen. Pause on your phone in the checkout
            line, press play at your desk, and the same sentence is waiting. Live updates arrive over WebSocket; no
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
            <p className="kicker kicker-cyan">iPhone &amp; Android</p>
            <h2 className="section-title">Native apps, made for the way out the door</h2>
            <p className="section-lede">
              Not a wrapped website: real native apps that keep the whole library in your pocket, currently in beta.
            </p>
            <ul className="feature-list">
              <li>
                <strong>Offline first.</strong> Download books to the phone, listen in airplane mode, and progress
                reconciles the moment you are back.
              </li>
              <li>
                <strong>Paired in seconds.</strong> Open the Audiobook App page on the web, scan the QR code, done. No
                passwords retyped on a phone keyboard.
              </li>
              <li>
                <strong>Made for iPad too.</strong> A sidebar layout that actually uses the screen.
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
          <p className="kicker kicker-magenta">One shelf, three formats</p>
          <h2 className="section-title">Audiobooks first. Not audiobooks only.</h2>
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
                EPUBs are scanned, enriched, and readable right in the browser. They are also served over OPDS, so
                you can keep using the reading app you already love.
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
                  <Cover key={comic.title} book={comic} issue={comic.issue} tall />
                ))}
              </div>
              <h3>Comics</h3>
              <p>
                Series and issues organized the way collectors expect: TPBs, omnibuses, one-shots. Browse, organize,
                and download your archives, or read them in your favorite comic app over OPDS.
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
                    <span key={i} style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }} />
                  ))}
                </div>
              </div>
              <h3>AI narration</h3>
              <p>
                No audiobook edition? Bookmark can narrate an ebook into a real M4B, chapters included, using any
                OpenAI-compatible text-to-speech server. A ready-to-run engine ships in the compose file.
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
            <p className="kicker kicker-cyan">Your household, your rules</p>
            <h2 className="section-title">Make it yours, and theirs</h2>
            <ul className="feature-list">
              <li>
                <strong>Every listener gets their own shelf.</strong> Separate progress, lists, stats, and preferences
                per account; nobody loses your spot.
              </li>
              <li>
                <strong>Permissions and tag filters.</strong> Decide who can edit metadata or upload, and keep certain
                shelves out of certain accounts.
              </li>
              <li>
                <strong>Slots into your stack.</strong> Optional OpenID Connect SSO, per-user API keys, and a REST API
                documented with Swagger.
              </li>
              <li>
                <strong>Sixteen accents, thirteen surfaces.</strong> From pure-black Pitch to light Silver, in English
                and Swedish.
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
            <h2 className="section-title">From zero to listening tonight</h2>
            <p className="section-lede">
              One image for the app, one for Postgres. Copy the config template, point it at your media folders, and
              start both with a single command. The first account you create becomes the admin.
            </p>
            <div className="hero-ctas" style={{ justifyContent: "flex-start", marginTop: "2rem" }}>
              <Link href="/get-started/" className="btn btn-neon">
                Read the guide
              </Link>
              <a href={GITHUB_URL} className="link-arrow" style={{ alignSelf: "center" }}>
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
              <span className="t-prompt">$ </span>git clone https://github.com/RobinEdquist/bookmark.git{"\n"}
              <span className="t-prompt">$ </span>cd bookmark{"\n"}
              <span className="t-prompt">$ </span>cp example.env .env{"\n"}
              <span className="t-comment"># point .env at your media folders, then:</span>
              {"\n"}
              <span className="t-prompt">$ </span>docker compose up -d{"\n"}
              <span className="t-accent">➜ Bookmark is listening at http://localhost:3001</span>
            </Terminal>
          </Reveal>
        </div>
      </section>
    </>
  );
}
