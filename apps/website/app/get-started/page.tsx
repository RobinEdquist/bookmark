import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_URL } from "../../components/site-header";
import { Terminal } from "../../components/terminal";

export const metadata: Metadata = {
  title: "Get started — Bookmark",
  description:
    "Self-host Bookmark in about five minutes: two containers, one command, and your audiobook folder. This guide walks through the first run, adding your library, and pairing the mobile apps.",
};

export default function GetStarted() {
  return (
    <>
      <section className="shell section-tight" style={{ paddingBottom: 0 }}>
          <p className="kicker kicker-magenta">Self-hosting guide</p>
          <h1 className="section-title" style={{ fontSize: "clamp(2.4rem, 5.5vw, 3.75rem)" }}>
            From zero to listening
          </h1>
          <p className="section-lede">
            Bookmark ships as a single container (web app and API together) plus a Postgres database. Two containers,
            one small config file, and about five minutes if your audiobooks are already in a folder.
          </p>
          <p className="section-lede prose-muted" style={{ marginTop: "0.9rem", fontSize: "0.9875rem" }}>
            You will need <strong style={{ color: "var(--ink)" }}>Docker with Compose</strong> and a folder of
            audiobooks (M4B, MP3, M4A, or OGG). Ebooks (EPUB) and comics (CBZ, CBR, PDF) are optional and can join
            later.
          </p>
      </section>

      <section className="shell section-tight">
        <div className="steps">
            <div className="step">
              <div>
                <h3>Clone the repository</h3>
                <Terminal
                  title="~ on your-server"
                  copyText={"git clone https://github.com/RobinEdquist/bookmark.git\ncd bookmark"}
                >
                  <span className="t-prompt">$ </span>git clone https://github.com/RobinEdquist/bookmark.git{"\n"}
                  <span className="t-prompt">$ </span>cd bookmark
                </Terminal>
              </div>
            </div>

            <div className="step">
              <div>
                <h3>Configure it before the first start</h3>
                <p>
                  Bookmark will start without any configuration, but you would be running an empty library on a
                  default database password. Take the two minutes: copy the template and point it at your actual
                  folders.
                </p>
                <div className="terminal env-block">
                  <div className="terminal-bar">
                    <span className="terminal-dot" aria-hidden />
                    <span className="terminal-dot" aria-hidden />
                    <span className="terminal-dot" aria-hidden />
                    <span className="terminal-title">.env</span>
                  </div>
                  <pre>
                    <span className="t-comment"># cp example.env .env, then set the essentials:</span>
                    {"\n"}AUDIOBOOK_LIBRARY_PATH=/path/to/your/audiobooks
                    {"\n"}EBOOK_LIBRARY_PATH=/path/to/your/ebooks{"      "}
                    <span className="t-comment"># optional</span>
                    {"\n"}COMIC_LIBRARY_PATH=/path/to/your/comics{"       "}
                    <span className="t-comment"># optional</span>
                    {"\n"}POSTGRES_PASSWORD=pick-something-strong
                  </pre>
                </div>
                <p style={{ marginTop: "1rem" }}>
                  The library mounts are read-only: Bookmark scans your files and never rewrites them. Set{" "}
                  <code className="ui-path">POSTGRES_PASSWORD</code> now rather than later; Postgres keeps the
                  password it was initialized with, so changing it after the first start means recreating the database
                  volume.
                </p>
              </div>
            </div>

            <div className="step">
              <div>
                <h3>Start it and claim the admin account</h3>
                <p>
                  This pulls the pre-built image. If you would rather build from source, run{" "}
                  <code className="ui-path">docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build</code>{" "}
                  instead.
                </p>
                <Terminal title="~/bookmark" copyText={"docker compose up -d"}>
                  <span className="t-prompt">$ </span>docker compose up -d
                </Terminal>
                <p style={{ marginTop: "1rem" }}>
                  Open <code className="ui-path">http://localhost:3001</code> and sign up. The first account created
                  becomes the admin; everyone after that is a regular listener with their own progress, lists, and
                  preferences. An auth secret is generated and persisted for you on first start.
                </p>
              </div>
            </div>

            <div className="step">
              <div>
                <h3>Let the wizard take it from here</h3>
                <p>
                  Your first sign-in opens a short setup wizard where you confirm your library folders, and scanning
                  starts automatically. Covers, chapters, and metadata fill in with live progress, and Bookmark keeps
                  watching the folders for new files from then on; big libraries keep importing in the background
                  while you start listening. Everything stays adjustable later under{" "}
                  <span className="ui-path">Settings → Libraries</span>.
                </p>
              </div>
            </div>

            <div className="step">
              <div>
                <h3>Take it beyond localhost</h3>
                <p>
                  To reach Bookmark on your own domain, add one more value to <code className="ui-path">.env</code>{" "}
                  and point your reverse proxy at port <code className="ui-path">3001</code>:
                </p>
                <div className="terminal env-block">
                  <div className="terminal-bar">
                    <span className="terminal-dot" aria-hidden />
                    <span className="terminal-dot" aria-hidden />
                    <span className="terminal-dot" aria-hidden />
                    <span className="terminal-title">.env</span>
                  </div>
                  <pre>PUBLIC_URL=https://bookmark.yourdomain.com</pre>
                </div>
                <p style={{ marginTop: "1rem" }}>
                  <code className="ui-path">PUBLIC_URL</code> is used for auth callbacks and CORS, so logins break
                  without it. Re-run <code className="ui-path">docker compose up -d</code> after changing it.
                </p>
              </div>
            </div>

            <div className="step">
              <div>
                <h3>Pair your phone</h3>
                <p>
                  Install the Bookmark app on iPhone or Android (both currently in beta), open the{" "}
                  <span className="ui-path">Audiobook App</span> page in the web sidebar, and scan the QR code. It
                  carries the server address and a fresh API key in one scan; no passwords retyped on a phone
                  keyboard. Manual entry works too if you prefer.
                </p>
              </div>
            </div>
        </div>
      </section>

      <section className="shell section-tight" style={{ paddingTop: 0 }}>
          <h2 className="section-title" style={{ fontSize: "clamp(1.6rem, 3vw, 2.25rem)" }}>
            Optional extras
          </h2>
          <div style={{ display: "grid", gap: "1rem", marginTop: "1.75rem" }}>
            <div className="note">
              <strong>AI narration.</strong> Start the bundled text-to-speech engine with{" "}
              <code className="ui-path">docker compose --profile tts up -d</code>, then enter{" "}
              <code className="ui-path">http://tts:8880</code> under{" "}
              <span className="ui-path">Settings → Integrations → Text-to-speech</span>. Any OpenAI-compatible
              text-to-speech server works as a drop-in replacement, self-hosted or cloud. Generated audiobooks land in
              your library under a <code className="ui-path">generated</code> folder.
            </div>
            <div className="note">
              <strong>Single sign-on.</strong> Set <code className="ui-path">OIDC_ENABLED=true</code> plus your
              issuer URL, client ID, and client secret in <code className="ui-path">.env</code> to slot Bookmark into
              an existing Authentik, Keycloak, or Authelia setup.
            </div>
            <div className="note">
              <strong>Backups.</strong> Everything Bookmark writes lives under <code className="ui-path">DATA_PATH</code>{" "}
              (default <code className="ui-path">./data</code>): the database, covers, and generated audiobooks. Back
              up that one folder and you can rebuild anywhere; your media stays untouched where it always was.
            </div>
            <div className="note">
              <strong>Something not working?</strong> <code className="ui-path">docker compose logs -f bookmark</code>{" "}
              tells you most of the story. Login loops usually mean <code className="ui-path">PUBLIC_URL</code> does
              not match the address in your browser. The full configuration reference lives in the{" "}
              <a href={`${GITHUB_URL}#configuration`} className="link-arrow" style={{ fontSize: "inherit" }}>
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
