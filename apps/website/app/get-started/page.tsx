import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_URL } from "../../components/site-header";
import { Terminal } from "../../components/terminal";

export const metadata: Metadata = {
  title: "Get started with Bookmark",
  description:
    "Self-host Bookmark in about five minutes: two containers, one compose file, and your audiobook folder. This guide walks through the first run, adding your library, and pairing the mobile apps.",
};

/**
 * The whole deployment, in one file. Kept deliberately minimal: anything the
 * image already defaults to (the auth secret, which is generated and persisted
 * on first start, plus every optional integration) is left out rather than
 * pasted in as noise.
 */
const COMPOSE = `services:
  postgres:
    image: postgres:16-alpine
    container_name: bookmark-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_DB: bookmark
      POSTGRES_PASSWORD: pick-something-strong # change this
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d bookmark"]
      interval: 10s
      timeout: 5s
      retries: 5

  bookmark:
    image: ghcr.io/robinedquist/bookmark:latest
    container_name: bookmark
    restart: unless-stopped
    init: true
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      # The same password you set above.
      DATABASE_URL: postgresql://postgres:pick-something-strong@postgres:5432/bookmark
      # Where you reach Bookmark. Both need your real address or logins break.
      BETTER_AUTH_URL: http://localhost:3001
      UI_URL: http://localhost:3001
    volumes:
      - ./data/app:/data
      # Your audiobooks. Read-only: Bookmark never writes here.
      - /path/to/your/audiobooks:/library/audiobooks:ro
      # Optional. Delete these two lines if you only have audiobooks.
      - /path/to/your/ebooks:/library/ebooks:ro
      - /path/to/your/comics:/library/comics:ro
    ports:
      - "3001:3001"

  # Optional engine for AI-narrated audiobooks. Sits idle until you ask for it
  # with: docker compose --profile tts up -d
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
          Bookmark ships as a single container (web app and API together) plus a
          Postgres database. Two containers, one file to paste, and about five
          minutes if your audiobooks are already in a folder.
        </p>
        <p
          className="section-lede prose-muted"
          style={{ marginTop: "0.9rem", fontSize: "0.9875rem" }}
        >
          You will need{" "}
          <strong style={{ color: "var(--ink)" }}>Docker with Compose</strong>{" "}
          and a folder of audiobooks (M4B, MP3, M4A, or OGG). Ebooks (EPUB) and
          comics (CBZ, CBR, PDF) are optional and can join later. There is
          nothing to clone and nothing to build.
        </p>
      </section>

      <section className="shell section-tight">
        <div className="steps">
          <div className="step">
            <div>
              <h3>Create the compose file</h3>
              <p>
                Make a folder to keep Bookmark in, and save the file below
                inside it as <code className="ui-path">docker-compose.yml</code>
                . This is the entire deployment, with no second config file to
                copy.
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
              <h3>Change the lines that matter</h3>
              <p>
                Bookmark will start on the defaults, but you would be running an
                empty library on a placeholder database password. Three edits,
                all marked in the file:
              </p>
              <ul className="prose-list">
                <li>
                  <strong>The database password</strong>, in{" "}
                  <strong style={{ color: "var(--ink)" }}>both places</strong>:
                  once under <code className="ui-path">POSTGRES_PASSWORD</code>{" "}
                  and again inside <code className="ui-path">DATABASE_URL</code>
                  . They have to match, and Postgres keeps whatever password it
                  was first initialized with, so changing it later means
                  recreating <code className="ui-path">./data/postgres</code>.
                </li>
                <li>
                  <strong>Your audiobook folder</strong>: replace{" "}
                  <code className="ui-path">/path/to/your/audiobooks</code> with
                  the real path on your machine. The part after the colon stays
                  as it is; that is where the folder appears inside the
                  container.
                </li>
                <li>
                  <strong>The ebook and comic lines</strong>: set them to real
                  paths, or delete both lines if you only have audiobooks.
                </li>
              </ul>
              <p style={{ marginTop: "1rem" }}>
                Your media mounts are read-only, so Bookmark can scan your files
                but never rewrite them.
              </p>
            </div>
          </div>

          <div className="step">
            <div>
              <h3>Start it and claim the admin account</h3>
              <Terminal title="~/bookmark" copyText={"docker compose up -d"}>
                <span className="t-prompt">$ </span>docker compose up -d
              </Terminal>
              <p style={{ marginTop: "1rem" }}>
                Open <code className="ui-path">http://localhost:3001</code> and
                sign up. The first account created becomes the admin; everyone
                after that is a regular listener with their own progress, lists,
                and preferences. An auth secret is generated and persisted for
                you on first start, which is why the file above does not mention
                one.
              </p>
            </div>
          </div>

          <div className="step">
            <div>
              <h3>Let the wizard take it from here</h3>
              <p>
                Your first sign-in opens a short setup wizard where you confirm
                your library folders, and scanning starts automatically. Covers,
                chapters, and metadata fill in with live progress, and Bookmark
                keeps watching the folders for new files from then on; big
                libraries keep importing in the background while you start
                listening. Everything stays adjustable later under{" "}
                <span className="ui-path">Settings → Libraries</span>.
              </p>
            </div>
          </div>

          <div className="step">
            <div>
              <h3>Take it beyond localhost</h3>
              <p>
                To reach Bookmark on your own domain, point your reverse proxy
                at port <code className="ui-path">3001</code> and change both
                address lines in the <code className="ui-path">bookmark</code>{" "}
                service:
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
                These are used for auth callbacks and CORS, so logins break if
                they do not match the address in your browser. Re-run{" "}
                <code className="ui-path">docker compose up -d</code> after
                changing them.
              </p>
            </div>
          </div>

          <div className="step">
            <div>
              <h3>Pair your phone</h3>
              <p>
                The Bookmark apps for iPhone and Android reach public beta soon.
                Once you have one installed, there are three ways to connect it,
                all under the <span className="ui-path">Audiobook App</span>{" "}
                page in the web sidebar.
              </p>
              <ul className="prose-list">
                <li>
                  <strong>Scan the QR code.</strong> It carries the server
                  address and a fresh access key in one scan, with no passwords
                  retyped on a phone keyboard.
                </li>
                <li>
                  <strong>Sign in inside the app.</strong> Enter your server
                  address and use your normal Bookmark account, or your identity
                  provider if you have single sign-on switched on. The app reads
                  which methods your server offers and shows only those, then
                  creates its own access key so there is nothing to copy across.
                </li>
                <li>
                  <strong>Paste a key by hand.</strong> Generate one under{" "}
                  <span className="ui-path">Preferences</span> if you would
                  rather not do either of the above.
                </li>
              </ul>
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
            <strong>Staying current.</strong> The{" "}
            <code className="ui-path">latest</code> tag follows released
            versions, so{" "}
            <code className="ui-path">
              docker compose pull &amp;&amp; docker compose up -d
            </code>{" "}
            takes you to the newest one. Bookmark also checks for new releases
            on its own and marks the sidebar when you are behind; set{" "}
            <code className="ui-path">
              UPDATE_CHECK_ENABLED: &quot;false&quot;
            </code>{" "}
            in the <code className="ui-path">bookmark</code> environment to
            switch that off. Prefer to live on the very latest commit? Swap the
            image tag for <code className="ui-path">edge</code>, which is
            untested by release standards, so keep backups.
          </div>
          <div className="note">
            <strong>AI narration.</strong> Bookmark can narrate an ebook into a
            real M4B. It writes the result to a{" "}
            <code className="ui-path">generated</code> folder inside your
            audiobook library, and since that library is mounted read-only, this
            is the one feature that needs an extra mount. Create the folder,
            then add the line:
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
            The folder has to exist before you add the mount, because Docker
            cannot create a mountpoint inside a read-only mount, and the
            container will refuse to start if it is missing. The mount then
            shadows that folder, so your originals are still never written to;
            the generated files live under{" "}
            <code className="ui-path">./data</code> with everything else
            Bookmark owns.
            <br />
            <br />
            Then start the engine with{" "}
            <code className="ui-path">
              docker compose --profile tts up -d
            </code>{" "}
            and enter <code className="ui-path">http://tts:8880</code> under{" "}
            <span className="ui-path">
              Settings → Integrations → Text-to-speech
            </span>
            . Any OpenAI-compatible text-to-speech server works as a drop-in
            replacement, self-hosted or cloud.
          </div>
          <div className="note">
            <strong>Single sign-on.</strong> Add{" "}
            <code className="ui-path">OIDC_ENABLED: &quot;true&quot;</code> plus
            your issuer URL, client ID, and client secret to the{" "}
            <code className="ui-path">bookmark</code> environment to slot
            Bookmark into an existing Authentik, Keycloak, or Authelia setup.
            The{" "}
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
            <strong>Backups.</strong> Everything Bookmark writes lives in the{" "}
            <code className="ui-path">./data</code> folder next to your compose
            file: the database, covers, the generated auth secret, and any
            AI-narrated audiobooks. Your media is never written to, so it needs
            no backup beyond whatever you already do.
            <br />
            <br />
            One catch worth knowing: copying{" "}
            <code className="ui-path">./data</code> while the stack is running
            is not a safe database backup. Postgres is writing as you copy, so
            you can capture a half-written state that refuses to start when
            restored. Stop it first, and the copy is sound:
            <br />
            <br />
            <code className="ui-path">docker compose down</code> → copy{" "}
            <code className="ui-path">./data</code> →{" "}
            <code className="ui-path">docker compose up -d</code>
            <br />
            <br />
            If you would rather not stop anything, take a database dump while it
            runs and keep it alongside your copy of{" "}
            <code className="ui-path">./data/app</code>:
            <br />
            <br />
            <code className="ui-path">
              docker compose exec -T postgres pg_dump -U postgres bookmark &gt;
              bookmark.sql
            </code>
            <br />
            <br />A restored <code className="ui-path">
              ./data/postgres
            </code>{" "}
            folder also expects the same Postgres major version it came from,
            which is why the compose file pins{" "}
            <code className="ui-path">postgres:16-alpine</code> rather than
            tracking the latest.{" "}
            <strong style={{ color: "var(--ink)" }}>
              Scheduled backups from inside Bookmark are coming
            </strong>
            : one button, correct by construction, no shell required.
          </div>
          <div className="note">
            <strong>Building from source instead.</strong> If you would rather
            compile the image yourself, clone the{" "}
            <a
              href={GITHUB_URL}
              className="link-arrow"
              style={{ fontSize: "inherit" }}
            >
              repository
            </a>{" "}
            and use the build override it ships with; that path is for
            contributors and does not need this guide.
          </div>
          <div className="note">
            <strong>Something not working?</strong>{" "}
            <code className="ui-path">docker compose logs -f bookmark</code>{" "}
            tells you most of the story. Login loops usually mean{" "}
            <code className="ui-path">BETTER_AUTH_URL</code> does not match the
            address in your browser, and a database connection error on first
            start usually means the two passwords do not match. The full
            configuration reference lives in the{" "}
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
