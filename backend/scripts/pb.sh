#!/bin/sh
# Runs backend/bin/pocketbase against backend/pb_data with the repo's migrations and hooks.
# Loads backend/.env (git-ignored) first, so REGATTA_OPS_GOOGLE_CLIENT_ID and friends reach the hooks.
#   sh scripts/pb.sh serve --http 127.0.0.1:8090
#   sh scripts/pb.sh migrate up
set -eu

BACKEND_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
BIN="$BACKEND_DIR/bin/pocketbase"

if [ ! -x "$BIN" ]; then
  echo "PocketBase is not downloaded yet. Run: pnpm pb:download" >&2
  exit 1
fi

if [ -f "$BACKEND_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$BACKEND_DIR/.env"
  set +a
fi

cd "$BACKEND_DIR"
exec "$BIN" "$@" \
  --dir "$BACKEND_DIR/pb_data" \
  --migrationsDir "$BACKEND_DIR/pb_migrations" \
  --hooksDir "$BACKEND_DIR/pb_hooks"
