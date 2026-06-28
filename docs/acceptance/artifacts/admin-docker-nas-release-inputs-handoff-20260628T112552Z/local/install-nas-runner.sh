#!/usr/bin/env sh
set -eu

TARGET_DIR="${1:-}"
if [ -z "$TARGET_DIR" ]; then
  echo "usage: sh ./install-nas-runner.sh <nas-compose-project-dir>" >&2
  exit 1
fi
if [ ! -d "$TARGET_DIR" ]; then
  echo "error: target directory does not exist: $TARGET_DIR" >&2
  exit 1
fi
if [ ! -f "$TARGET_DIR/docker-compose.yml" ] || [ ! -f "$TARGET_DIR/.env" ]; then
  echo "error: target must contain docker-compose.yml and .env: $TARGET_DIR" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BUNDLE_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
SRC_NAS_DIR="$BUNDLE_DIR/nas"
if [ ! -f "$SRC_NAS_DIR/RUN_ON_NAS.sh" ] || [ ! -f "$SRC_NAS_DIR/admin-docker-nas-release-inputs-collector.sh" ]; then
  echo "error: missing nas runner files under $SRC_NAS_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR/nas"
cp "$SRC_NAS_DIR/RUN_ON_NAS.sh" "$TARGET_DIR/nas/RUN_ON_NAS.sh"
cp "$SRC_NAS_DIR/admin-docker-nas-release-inputs-collector.sh" "$TARGET_DIR/nas/admin-docker-nas-release-inputs-collector.sh"
chmod 755 "$TARGET_DIR/nas/RUN_ON_NAS.sh" "$TARGET_DIR/nas/admin-docker-nas-release-inputs-collector.sh"

cat <<EOF
Installed read-only NAS release-input collector into:
  $TARGET_DIR/nas

On the NAS host, run from the Compose project folder:
  sh ./nas/RUN_ON_NAS.sh

This installer copied scripts only. It did not edit .env, restart containers,
enable workers, run push_images=true, or collect evidence.
EOF
