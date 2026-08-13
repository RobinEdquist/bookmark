#!/bin/bash
# Entrypoint for the combined Bookmark image: brings up a database, runs
# migrations, then starts the backend (port 3000, internal) and the web app
# (port 3001, published). If any process dies the container exits so the restart
# policy kicks in.
set -e

APP_DATA_PATH="${APP_DATA_PATH:-/data}"

# Generate a persistent auth secret on first run if none was provided, so a
# plain `docker compose up` works without any required configuration.
if [ -z "$BETTER_AUTH_SECRET" ]; then
  SECRET_FILE="${APP_DATA_PATH}/.better-auth-secret"
  if [ ! -f "$SECRET_FILE" ]; then
    echo "No BETTER_AUTH_SECRET set - generating one and persisting it to $SECRET_FILE"
    (umask 077 && openssl rand -base64 32 > "$SECRET_FILE")
  fi
  BETTER_AUTH_SECRET="$(cat "$SECRET_FILE")"
  export BETTER_AUTH_SECRET
fi

# =============================================================================
# Database
#
# Two modes, chosen by whether DATABASE_URL is set:
#
#   set   - external Postgres, exactly as before. Nothing below runs.
#   unset - the Postgres server bundled in this image (see Dockerfile), with its
#           data directory under the app data volume. One container, no database
#           configuration, and no credentials to manage.
#
# Both modes speak to the same engine, so there is one SQL dialect and one set
# of migrations either way.
# =============================================================================
PG_DATA_DIR="${APP_DATA_PATH}/db"
PG_SOCKET_DIR=/run/postgresql
PG_ROLE=bookmark
PG_DB=bookmark

# Set by the Dockerfile; the fallback keeps the script usable outside the image
PG_MAJOR="${PG_MAJOR:-}"

POSTGRES_PID=""
BACKEND_PID=""
WEB_PID=""

signal_pid() { [ -n "$1" ] && kill "-$2" "$1" 2> /dev/null || true; }

# Wait for a process to actually be gone.
#
# `wait` alone is not enough: called from inside a trap handler it can return
# immediately rather than blocking, which would let the script exit while the
# database is still checkpointing - the container then dies mid-shutdown and
# the next start has to run WAL recovery. Polling kill -0 is what makes the
# ordering real. Bounded so a wedged process cannot hang the container forever.
reap_pid() {
  local pid="$1" waited=0
  [ -n "$pid" ] || return 0

  wait "$pid" 2> /dev/null || true

  while kill -0 "$pid" 2> /dev/null && [ "$waited" -lt 120 ]; do
    sleep 0.2
    waited=$((waited + 1))
  done
}

# Reap, but never wait forever. The apps are stateless and safe to kill; the
# database is not. Docker grants a fixed budget before it SIGKILLs everything
# (10s by default, raised via stop_grace_period in docker-compose.yml, but a
# plain `docker run` still gets 10s), and an app that refuses to exit must not
# eat the time the database needs to checkpoint and shut down cleanly.
reap_pid_or_kill() {
  local pid="$1" waited=0
  [ -n "$pid" ] || return 0

  while kill -0 "$pid" 2> /dev/null && [ "$waited" -lt 5 ]; do
    sleep 1
    waited=$((waited + 1))
  done

  if kill -0 "$pid" 2> /dev/null; then
    echo "Process $pid did not stop in ${waited}s, killing it" >&2
    kill -KILL "$pid" 2> /dev/null || true
  fi
  reap_pid "$pid"
}

# Bring the apps down before the database, so nothing is mid-query when the
# server stops. SIGINT is Postgres' fast shutdown: roll back open transactions,
# checkpoint, exit - which avoids WAL recovery on the next start.
shutdown() {
  signal_pid "$WEB_PID" TERM
  signal_pid "$BACKEND_PID" TERM
  reap_pid_or_kill "$WEB_PID"
  reap_pid_or_kill "$BACKEND_PID"
  signal_pid "$POSTGRES_PID" INT
  reap_pid "$POSTGRES_PID"
}

# Installed before anything is started so that a SIGTERM arriving mid-startup -
# during migrations, say - still stops the database cleanly. EXIT covers the
# other half: without it, any `set -e` failure or startup error would leave the
# database to be killed with the container, forcing WAL recovery on next boot.
# shutdown() is idempotent, so running it twice on the normal path is harmless.
trap shutdown TERM INT EXIT

# Prefix that drops to the postgres system user. Postgres refuses to run as root,
# so this is required for initdb and the server itself. If the container was
# started with --user we are already unprivileged and run as whoever that is
# (their uid then has to own the data directory), so the prefix is empty.
#
# This is an array used inline rather than a wrapper function on purpose. A
# backgrounded shell function runs in a forked subshell, so `$!` would be the
# subshell's pid and not the server's - signalling it would leave the real
# postmaster orphaned and killed uncleanly. As a simple command, bash execs
# directly and `$!` is the postmaster.
if [ "$(id -u)" = "0" ]; then
  PG_PRIV=(setpriv --reuid=postgres --regid=postgres --clear-groups)
else
  PG_PRIV=()
fi

# The backend and web app must never run as root: a compromise of either (for
# example through a malicious media file) would otherwise own the whole
# container, including the database files. Root is used only for the one-time
# ownership fixes below; both node processes drop to the unprivileged "node"
# user shipped in the base image. HOME is set because setpriv does not change
# it and Chromium (Goodreads scraper) needs a writable home directory.
#
# Same inline-array pattern as PG_PRIV: setpriv and env both exec, so `$!`
# remains the pid of the actual node process.
if [ "$(id -u)" = "0" ]; then
  APP_PRIV=(setpriv --reuid=node --regid=node --clear-groups env HOME=/home/node)
else
  APP_PRIV=()
fi

# Postgres needs POSIX file locking and durable fsync semantics that network
# filesystems do not reliably provide. SMB is the common self-hosting mistake
# (an app data folder pointed at a NAS share) and simply does not work, so it is
# refused rather than left to corrupt later.
check_data_dir_filesystem() {
  local fstype
  fstype="$(stat -f -c %T "$PG_DATA_DIR" 2> /dev/null || echo unknown)"

  case "$fstype" in
    cifs | smb* | msdos | vfat)
      if [ "$BOOKMARK_DB_ALLOW_NETWORK_FS" = "true" ]; then
        echo "WARNING: database directory is on '$fstype', which cannot safely run Postgres." >&2
        echo "         Continuing because BOOKMARK_DB_ALLOW_NETWORK_FS=true. Expect corruption." >&2
      else
        echo "ERROR: the built-in database cannot run on a '$fstype' filesystem." >&2
        echo "       $PG_DATA_DIR is on a network or non-POSIX share, which does not provide" >&2
        echo "       the file locking and fsync guarantees Postgres needs - your data would" >&2
        echo "       be at risk of corruption." >&2
        echo "" >&2
        echo "       Fix this by either:" >&2
        echo "         - pointing the app data volume at local disk (a Docker named volume" >&2
        echo "           is the easy option), keeping your media on the share; or" >&2
        echo "         - running Postgres yourself and setting DATABASE_URL." >&2
        exit 1
      fi
      ;;
    nfs*)
      echo "WARNING: database directory is on '$fstype'. Postgres on NFS needs careful mount" >&2
      echo "         options (hard, no attribute caching) and is not recommended. Consider" >&2
      echo "         local disk for the app data volume, or set DATABASE_URL." >&2
      ;;
  esac
}

# A data directory can only be read by the major version that created it. Fail
# loudly rather than letting the server exit with a bare "incompatible" message.
check_data_dir_version() {
  local existing
  [ -n "$PG_MAJOR" ] || return 0
  [ -s "$PG_DATA_DIR/PG_VERSION" ] || return 0

  existing="$(cat "$PG_DATA_DIR/PG_VERSION")"
  [ "$existing" = "$PG_MAJOR" ] && return 0

  echo "ERROR: the built-in database directory was created by PostgreSQL $existing," >&2
  echo "       but this image bundles PostgreSQL $PG_MAJOR. Data directories are not" >&2
  echo "       compatible across major versions." >&2
  echo "" >&2
  echo "       $PG_DATA_DIR has not been touched. To move the data across, start the" >&2
  echo "       older Bookmark image again, dump the database:" >&2
  echo "         docker exec <container> pg_dump -U $PG_ROLE $PG_DB > bookmark.sql" >&2
  echo "       then remove $PG_DATA_DIR, start this image, and restore:" >&2
  echo "         docker exec -i <container> psql -U $PG_ROLE $PG_DB < bookmark.sql" >&2
  exit 1
}

start_bundled_postgres() {
  mkdir -p "$PG_DATA_DIR" "$PG_SOCKET_DIR"

  if [ "$(id -u)" = "0" ]; then
    chown postgres:postgres "$PG_DATA_DIR" "$PG_SOCKET_DIR"
  fi
  # Postgres refuses to start on a data directory that is group/world readable
  chmod 0700 "$PG_DATA_DIR"

  check_data_dir_filesystem
  check_data_dir_version

  if [ ! -s "$PG_DATA_DIR/PG_VERSION" ]; then
    echo "Initialising the built-in database in $PG_DATA_DIR (first start)..."

    # --auth-local=trust with no TCP listener means there is no password to
    # generate, store or rotate: the only way in is a socket that exists inside
    # this container. trust rather than peer because the app runs as the node
    # user while the server runs as postgres, so the OS and database users
    # never match.
    #
    # en_US.UTF-8 matches the official postgres image, which keeps ORDER BY and
    # pg_trgm search behaving identically in bundled and external deployments.
    "${PG_PRIV[@]}" initdb \
      --pgdata="$PG_DATA_DIR" \
      --username="$PG_ROLE" \
      --encoding=UTF8 \
      --locale=en_US.UTF-8 \
      --auth-local=trust \
      --auth-host=reject

    # Written once, at init, so anyone who later tunes these keeps their edits.
    # Modest defaults for a media library rather than an OLTP server; the
    # backend's connection pool tops out at 10.
    cat >> "$PG_DATA_DIR/postgresql.conf" << 'PGCONF'

# --- Bookmark defaults (edit freely; only written when the cluster is created)
shared_buffers = 256MB
max_connections = 50
# No JIT provider is installed in this image, so asking for it only adds log noise
jit = off
PGCONF
  fi

  echo "Starting the built-in database..."
  # listen_addresses='' disables TCP entirely - the socket is the only entry
  # point. timezone follows TZ so that day-bucketed stats (listening history,
  # streaks) line up with the timezone the rest of the instance renders in.
  "${PG_PRIV[@]}" postgres \
    -D "$PG_DATA_DIR" \
    -c listen_addresses='' \
    -c unix_socket_directories="$PG_SOCKET_DIR" \
    -c timezone="${TZ:-UTC}" &
  POSTGRES_PID=$!

  echo "Waiting for the database to accept connections..."
  until pg_isready -q -h "$PG_SOCKET_DIR" -U "$PG_ROLE" -d postgres; do
    if ! kill -0 "$POSTGRES_PID" 2> /dev/null; then
      echo "The built-in database exited during startup" >&2
      exit 1
    fi
    sleep 1
  done

  if ! psql -h "$PG_SOCKET_DIR" -U "$PG_ROLE" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '$PG_DB'" | grep -q 1; then
    echo "Creating the '$PG_DB' database..."
    createdb -h "$PG_SOCKET_DIR" -U "$PG_ROLE" "$PG_DB"
  fi

  export DATABASE_URL="postgresql://${PG_ROLE}@/${PG_DB}?host=${PG_SOCKET_DIR}"
}

if [ -n "$DATABASE_URL" ]; then
  echo "Database: external (DATABASE_URL is set)"
else
  echo "Database: built-in (no DATABASE_URL set)"
  start_bundled_postgres
fi

echo "Running database migrations..."
cd /app/apps/backend
npx drizzle-kit migrate

# Hand the app data directory to the node user. Volumes start out root-owned,
# and data written by pre-hardening releases (covers, secrets) is root-owned
# too. The database directory stays with the postgres user.
if [ "$(id -u)" = "0" ]; then
  find "$APP_DATA_PATH" -mindepth 1 -maxdepth 1 ! -name db \
    -exec chown -R node:node {} +
  chown node:node "$APP_DATA_PATH"
fi

echo "Starting backend API on port 3000..."
PORT=3000 "${APP_PRIV[@]}" node dist/src/main.js &
BACKEND_PID=$!

echo "Waiting for backend to become healthy..."
until curl -sf http://127.0.0.1:3000/api/health > /dev/null; do
  if ! kill -0 "$BACKEND_PID" 2> /dev/null; then
    echo "Backend exited during startup" >&2
    exit 1
  fi
  sleep 1
done

echo "Starting web app on port 3001..."
cd /web
PORT=3001 HOSTNAME=0.0.0.0 "${APP_PRIV[@]}" node apps/web/server.js &
WEB_PID=$!

# Wait for any managed process to exit, then bring the rest down with it
EXIT_CODE=0
wait -n || EXIT_CODE=$?
shutdown
exit "$EXIT_CODE"
