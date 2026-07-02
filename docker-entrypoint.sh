#!/bin/bash
# Entrypoint for the combined Bookmark image: runs migrations, then starts the
# backend (port 3000, internal) and the web app (port 3001, published).
# If either process dies the container exits so the restart policy kicks in.
set -e

# Generate a persistent auth secret on first run if none was provided, so a
# plain `docker compose up` works without any required configuration.
if [ -z "$BETTER_AUTH_SECRET" ]; then
  SECRET_FILE="${APP_DATA_PATH:-/data}/.better-auth-secret"
  if [ ! -f "$SECRET_FILE" ]; then
    echo "No BETTER_AUTH_SECRET set - generating one and persisting it to $SECRET_FILE"
    (umask 077 && openssl rand -base64 32 > "$SECRET_FILE")
  fi
  BETTER_AUTH_SECRET="$(cat "$SECRET_FILE")"
  export BETTER_AUTH_SECRET
fi

echo "Running database migrations..."
cd /app/apps/backend
npx drizzle-kit migrate

echo "Starting backend API on port 3000..."
PORT=3000 node dist/src/main.js &
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
PORT=3001 HOSTNAME=0.0.0.0 node apps/web/server.js &
WEB_PID=$!

shutdown() {
  kill -TERM "$BACKEND_PID" "$WEB_PID" 2> /dev/null || true
}
trap shutdown TERM INT

# Wait for either process to exit, then bring the other one down with it
EXIT_CODE=0
wait -n || EXIT_CODE=$?
shutdown
wait "$BACKEND_PID" "$WEB_PID" 2> /dev/null || true
exit "$EXIT_CODE"
