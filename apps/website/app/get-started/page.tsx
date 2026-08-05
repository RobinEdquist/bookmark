import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_URL } from "../../components/site-header";
import { Terminal } from "../../components/terminal";

export const metadata: Metadata = {
  title: "Get started with Bookmark",
  description:
    "Set up Bookmark in about five minutes: one container, one file, and your audiobook folder.",
};

/**
 * The whole deployment, in one file. Kept deliberately minimal: anything the
 * image already defaults to (the database and the auth secret, both created and
 * persisted on first start, plus every optional integration) is left out rather
 * than pasted in as noise.
 */
const COMPOSE = `services:
  bookmark:
    image: ghcr.io/robinedquist/bookmark:latest
    container_name: bookmark
    restart: unless-stopped
    init: true
    # Time to shut the database down cleanly on stop.
    stop_grace_period: 2m
    environment:
      # The address you open Bookmark at. Both lines need it.
      BETTER_AUTH_URL: http://localhost:3001
      UI_URL: http://localhost:3001
      # Your timezone, so times match your clock.
      TZ: Europe/Stockholm # change this
    volumes:
      # Bookmark's own data. Keep this on local disk, not a NAS share.
      - ./data/app:/data
      # Your audiobooks. Read-only: Bookmark never writes here.
      - /path/to/your/audiobooks:/library/audiobooks:ro
      # Optional. Delete these two lines if you only have audiobooks.
      - /path/to/your/ebooks:/library/ebooks:ro
      - /path/to/your/comics:/library/comics:ro
    ports:
      - "3001:3001"

  # Optional, for AI-narrated audiobooks. Idle until you start it with:
  # docker compose --profile tts up -d
  tts:
    image: ghcr.io/remsky/kokoro-fastapi-cpu:latest
    container_name: bookmark-tts
    restart: unless-stopped
    profiles: ["tts"]`;

/**
 * Renders YAML with its comments dimmed, from the same string that feeds the
 * copy button, so what you read and what you paste cannot drift apart. Splits
 * on " #", which is unambiguous here: no value in the file contains one.
 */
function highlightYaml(source: string) {
  return source.split("\n").map((line, index) => {
    const newline = index > 0 ? "\n" : "";
    const commentStart = line.startsWith("#") ? 0 : line.indexOf(" #");

    if (commentStart === -1) {
      return (
        <span key={index}>
          {newline}
          {line}
        </span>
      );
    }

    return (
      <span key={index}>
        {newline}
        {line.slice(0, commentStart)}
        <span className="t-comment">{line.slice(commentStart)}</span>
      </span>
    );
  });
}

export default function GetStarted() {
  return (
    <>
      <section className="shell section-tight" style={{ paddingBottom: 0 }}>
        <p className="kicker kicker-magenta">Self-hosting guide</p>
        <h1
          className="section-title"
          style={{ fontSize: "clamp(2.4rem, 5.5vw, 3.75rem)" }}
        >
          From zero to listening
        </h1>
        <p className="section-lede">
          One container, one file to paste, about five minutes. Nothing to
          clone, nothing to build.
        </p>
        <p
          className="section-lede prose-muted"
          style={{ marginTop: "0.9rem", fontSize: "0.9875rem" }}
        >
          You need{" "}
          <strong style={{ color: "var(--ink)" }}>Docker with Compose</strong>{" "}
          and a folder of audiobooks (M4B, MP3, M4A, OGG). Ebooks and comics are
          optional and can join later.
        </p>
      </section>

      <section className="shell section-tight">
        <div className="steps">
          <div className="step">
            <div>
              <h3>Create the compose file</h3>
              <p>
                Make a folder for Bookmark, then save the file below inside it
                as <code className="ui-path">docker-compose.yml</code>.
              </p>
              <Terminal
                title="~ on your-server"
                copyText={"mkdir bookmark\ncd bookmark"}
              >
                <span className="t-prompt">$ </span>mkdir bookmark{"\n"}
                <span className="t-prompt">$ </span>cd bookmark
              </Terminal>
              <div style={{ marginTop: "1rem" }}>
                <Terminal title="docker-compose.yml" copyText={COMPOSE}>
                  {highlightYaml(COMPOSE)}
                </Terminal>
              </div>
            </div>
          </div>

          <div className="step">
            <div>
              <h3>Edit three lines</h3>
              <p>Everything you need to change is marked in the file:</p>
              <ul className="prose-list">
                <li>
                  <strong>Your audiobook folder</strong>: replace{" "}
                  <code className="ui-path">/path/to/your/audiobooks</code>.
                  Leave the part after the colon alone.
                </li>
                <li>
                  <strong>Ebooks and comics</strong>: real paths, or delete both
                  lines.
                </li>
                <li>
                  <strong>Your timezone</strong>: for example{" "}
                  <code className="ui-path">America/New_York</code>.{" "}
                  <a
                    href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
                    className="link-arrow"
                    style={{ fontSize: "inherit" }}
                  >
                    Find yours
                  </a>
                  .
                </li>
              </ul>
              <p style={{ marginTop: "1rem" }}>
                Your folders are read-only. Bookmark reads your files and never
                changes them.
              </p>
            </div>
          </div>

          <div className="step">
            <div>
              <h3>Start it and sign up</h3>
              <Terminal title="~/bookmark" copyText={"docker compose up -d"}>
                <span className="t-prompt">$ </span>docker compose up -d
              </Terminal>
              <p style={{ marginTop: "1rem" }}>
                Open <code className="ui-path">http://localhost:3001</code> and
                sign up. The first account is the admin. Everyone after that is
                a listener with their own progress and lists.
              </p>
            </div>
          </div>

          <div className="step">
            <div>
              <h3>Let the wizard finish</h3>
              <p>
                A short wizard confirms your folders, then scanning starts on
                its own. Covers and chapters fill in while you browse, and new
                files are picked up automatically. Change anything later under{" "}
                <span className="ui-path">Settings → Libraries</span>.
              </p>
            </div>
          </div>

          <div className="step">
            <div>
              <h3>Use your own domain</h3>
              <p>
                Point your reverse proxy at port{" "}
                <code className="ui-path">3001</code>, then put your address on
                both lines:
              </p>
              <div className="terminal env-block">
                <div className="terminal-bar">
                  <span className="terminal-dot" aria-hidden />
                  <span className="terminal-dot" aria-hidden />
                  <span className="terminal-dot" aria-hidden />
                  <span className="terminal-title">docker-compose.yml</span>
                </div>
                <pre>
                  {"      "}BETTER_AUTH_URL: https://bookmark.yourdomain.com
                  {"\n"}
                  {"      "}UI_URL: https://bookmark.yourdomain.com
                </pre>
              </div>
              <p style={{ marginTop: "1rem" }}>
                They have to match the address in your browser, or logins fail.
                Run <code className="ui-path">docker compose up -d</code> again
                afterwards.
              </p>
            </div>
          </div>

          <div className="step">
            <div>
              <h3>Pair your phone</h3>
              <p>
                The iPhone and Android apps reach public beta soon. When you
                have one, open <span className="ui-path">Audiobook App</span> in
                the sidebar and either scan the QR code or sign in with your
                usual account. No keys to type.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="shell section-tight" style={{ paddingTop: 0 }}>
        <h2
          className="section-title"
          style={{ fontSize: "clamp(1.6rem, 3vw, 2.25rem)" }}
        >
          Optional extras
        </h2>
        <div style={{ display: "grid", gap: "1rem", marginTop: "1.75rem" }}>
          <div className="note">
            <strong>AI narration.</strong> Bookmark can narrate an ebook into a
            real audiobook. Make a folder for the results first, then add it to
            the file:
            <br />
            <br />
            <code className="ui-path">
              mkdir -p /path/to/your/audiobooks/generated
            </code>
            <br />
            <br />
            <code className="ui-path">
              - ./data/generated-audiobooks:/library/audiobooks/generated
            </code>
            <br />
            <br />
            The folder has to exist before you add that line, or Bookmark will
            not start.
            <br />
            <br />
            Then run{" "}
            <code className="ui-path">
              docker compose --profile tts up -d
            </code>{" "}
            and enter <code className="ui-path">http://tts:8880</code> under{" "}
            <span className="ui-path">
              Settings → Integrations → Text-to-speech
            </span>
            .
          </div>
          <div className="note">
            <strong>Single sign-on.</strong> Add{" "}
            <code className="ui-path">OIDC_ENABLED: &quot;true&quot;</code> plus
            your issuer URL, client ID, and client secret to sign in through
            Authentik, Keycloak, or Authelia. The{" "}
            <a
              href={`${GITHUB_URL}#configuration`}
              className="link-arrow"
              style={{ fontSize: "inherit" }}
            >
              configuration reference
            </a>{" "}
            lists the exact names.
          </div>
          <div className="note">
            <strong>Something not working?</strong> Run{" "}
            <code className="ui-path">docker compose logs -f bookmark</code>.
            Login problems almost always mean the two address lines do not match
            the address in your browser. Everything you can configure is listed
            in the{" "}
            <a
              href={`${GITHUB_URL}#configuration`}
              className="link-arrow"
              style={{ fontSize: "inherit" }}
            >
              README
            </a>
            .
          </div>
        </div>
      </section>

      <section className="shell section-tight" style={{ textAlign: "center" }}>
        <p className="section-lede" style={{ margin: "0 auto" }}>
          That is the whole setup. Tonight&apos;s chapter is waiting.
        </p>
        <div className="hero-ctas">
          <Link href="/" className="btn btn-quiet">
            Back to the tour
          </Link>
          <a href={GITHUB_URL} className="btn btn-neon">
            Star it on GitHub
          </a>
        </div>
      </section>
    </>
  );
}
