#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PUBLIC_ROOT="${MIXLAB_REAL_PUBLIC_LIBRARY_ROOT:-/Volumes/MixLab/PublicLibrary}"
ALT_PUBLIC_ROOT="${MIXLAB_REAL_PUBLIC_LIBRARY_ALT_ROOT:-/Volumes/PublicLibrary}"
NAS_SHARE_URL="${MIXLAB_REAL_PUBLIC_LIBRARY_SMB_URL:-smb://192.168.1.27/MixLab}"
CACHE_ROOT="${MIXLAB_LOCAL_RELEASE_CACHE_ROOT:-$HOME/Movies/MixLabLocal/cache}"
WORKSPACE_ROOT="${MIXLAB_CUTTER_WORKSPACE_ROOT:-$HOME/Movies/MixLabLocal}"
MOUNT_WAIT_SECONDS="${MIXLAB_REAL_PUBLIC_LIBRARY_MOUNT_WAIT_SECONDS:-20}"

resolve_public_root() {
  if [[ -d "$PUBLIC_ROOT/.mixlab-library" ]]; then
    return 0
  fi

  if [[ -d "$ALT_PUBLIC_ROOT/.mixlab-library" ]]; then
    PUBLIC_ROOT="$ALT_PUBLIC_ROOT"
    return 0
  fi

  return 1
}

if ! resolve_public_root; then
  echo "MixLab real PublicLibrary is not mounted. Trying to mount NAS share: $NAS_SHARE_URL" >&2
  osascript -e "mount volume \"$NAS_SHARE_URL\"" >/dev/null 2>&1 || open "$NAS_SHARE_URL" >/dev/null 2>&1 || true

  for _ in $(seq 1 "$MOUNT_WAIT_SECONDS"); do
    if resolve_public_root; then
      break
    fi
    sleep 1
  done
fi

if ! resolve_public_root; then
  cat >&2 <<EOF
MixLab real PublicLibrary is not mounted.

Expected one of:
  $PUBLIC_ROOT
  $ALT_PUBLIC_ROOT

Mount the NAS share first, then rerun:
  open '$NAS_SHARE_URL'

This guard intentionally refuses to start Admin API against the Cutter cache.
EOF
  exit 2
fi

if [[ ! -d "$CACHE_ROOT/.mixlab-library" ]]; then
  cat >&2 <<EOF
MixLab local release cache is missing:
  $CACHE_ROOT

The Cutter API can use the real PublicLibrary for source data, but the local
release cache keeps the Cutter UI fast. Rebuild or sync the cache before use.
EOF
  exit 3
fi

mkdir -p .local-dev/logs .local-dev/pids "$WORKSPACE_ROOT"

for session in \
  mixlab-searchd \
  mixlab-admin-api \
  mixlab-cutter-api \
  mixlab-admin-web \
  mixlab-cutter-web
do
  screen -S "$session" -X quit 2>/dev/null || true
done

pkill -f 'scripts/servers/admin-api-server.ts' 2>/dev/null || true
pkill -f 'scripts/servers/cutter-api-server.ts' 2>/dev/null || true
pkill -f 'packages/searchd/target/debug/mixlab-searchd' 2>/dev/null || true
pkill -f 'node .*vite --host 127.0.0.1 --.*--port 5176' 2>/dev/null || true
pkill -f 'node .*vite --host 127.0.0.1 --.*--port 5177' 2>/dev/null || true

: > .local-dev/logs/searchd.log
: > .local-dev/logs/admin-api.log
: > .local-dev/logs/cutter-api.log
: > .local-dev/logs/admin-web.log
: > .local-dev/logs/cutter-web.log

screen -dmS mixlab-searchd bash -lc "cd '$ROOT_DIR' && exec env MIXLAB_SEARCHD_LIBRARY_ROOT='$PUBLIC_ROOT' MIXLAB_SEARCHD_RELEASE_ROOT='$CACHE_ROOT' MIXLAB_SEARCHD_CACHE_ROOT='$CACHE_ROOT/searchd' MIXLAB_SEARCHD_HOST=127.0.0.1 MIXLAB_SEARCHD_PORT=3790 npm run server:searchd >> .local-dev/logs/searchd.log 2>&1"

screen -dmS mixlab-admin-api bash -lc "cd '$ROOT_DIR' && exec env MIXLAB_ADMIN_LIBRARY_ROOT='$PUBLIC_ROOT' MIXLAB_ADMIN_API_HOST=127.0.0.1 MIXLAB_ADMIN_API_PORT=3889 MIXLAB_ADMIN_AUTH_MODE=password npm run server:admin-api >> .local-dev/logs/admin-api.log 2>&1"

screen -dmS mixlab-cutter-api bash -lc "cd '$ROOT_DIR' && exec env MIXLAB_CUTTER_LIBRARY_ROOT='$PUBLIC_ROOT' MIXLAB_CUTTER_RELEASE_CACHE_ROOT='$CACHE_ROOT' MIXLAB_CUTTER_WORKSPACE_ROOT='$WORKSPACE_ROOT' MIXLAB_CUTTER_API_HOST=127.0.0.1 MIXLAB_CUTTER_API_PORT=3789 MIXLAB_SEARCHD_BASE_URL=http://127.0.0.1:3790 MIXLAB_CUTTER_AUTH_MODE=reviewed npm run server:cutter-api >> .local-dev/logs/cutter-api.log 2>&1"

screen -dmS mixlab-admin-web bash -lc "cd '$ROOT_DIR' && exec env VITE_MIXLAB_ADMIN_API_BASE_URL=http://127.0.0.1:3889 npm run -w @mixlab/admin-web dev -- --host 127.0.0.1 --port 5176 --strictPort >> .local-dev/logs/admin-web.log 2>&1"

screen -dmS mixlab-cutter-web bash -lc "cd '$ROOT_DIR' && exec env VITE_MIXLAB_CUTTER_API_BASE_URL=http://127.0.0.1:3789 npm run -w @mixlab/cutter-web dev -- --host 127.0.0.1 --port 5177 --strictPort >> .local-dev/logs/cutter-web.log 2>&1"

sleep 4

echo "MixLab local real PublicLibrary stack started."
echo "PublicLibrary: $PUBLIC_ROOT"
echo "Release cache: $CACHE_ROOT"
echo "Workspace: $WORKSPACE_ROOT"
echo
screen -ls || true
echo
lsof -nP -iTCP:5176 -iTCP:5177 -iTCP:3889 -iTCP:3789 -iTCP:3790 -sTCP:LISTEN || true
