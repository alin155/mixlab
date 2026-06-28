#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
  COMPOSE_DIR="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/../docker-compose.yml" ]; then
  COMPOSE_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
else
  echo "error: run this from, or copy this folder into, the NAS Compose project folder containing docker-compose.yml and .env" >&2
  exit 1
fi

OUT_DIR="${1:-admin-docker-release-inputs}"
cd "$COMPOSE_DIR"
sh "$SCRIPT_DIR/admin-docker-nas-release-inputs-collector.sh" "$OUT_DIR"
