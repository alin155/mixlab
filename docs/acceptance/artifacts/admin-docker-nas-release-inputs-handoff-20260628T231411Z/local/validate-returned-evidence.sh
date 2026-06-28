#!/usr/bin/env sh
set -eu

die() {
  printf '%s\n' "error: $*" >&2
  exit 1
}

RETURNED_DIR="${1:-${MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR:-}}"
if [ -z "$RETURNED_DIR" ]; then
  echo "usage: sh ./validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>" >&2
  exit 1
fi
if [ ! -d "$RETURNED_DIR" ]; then
  die "returned evidence directory does not exist: $RETURNED_DIR"
fi

REQUIRED_FILES="admin-docker-current.env admin-docker-current.inspect.json admin-worker.env admin-worker.inspect.json admin-docker-disk-proof.json MANIFEST.txt README.md"
MISSING_FILES=""
for file in $REQUIRED_FILES; do
  if [ ! -f "$RETURNED_DIR/$file" ]; then
    MISSING_FILES="$MISSING_FILES $file"
  fi
done
if [ -n "$MISSING_FILES" ]; then
  die "returned evidence is missing required sanitized files:$MISSING_FILES"
fi

for path in "$RETURNED_DIR"/* "$RETURNED_DIR"/.[!.]* "$RETURNED_DIR"/..?*; do
  [ -e "$path" ] || continue
  base="$(basename "$path")"
  case "$base" in
    admin-docker-current.env|admin-docker-current.inspect.json|admin-worker.env|admin-worker.inspect.json|admin-docker-disk-proof.json|MANIFEST.txt|README.md)
      ;;
    *)
      die "unexpected file in returned evidence directory: $base"
      ;;
  esac
done

for file in admin-docker-current.env admin-docker-current.inspect.json admin-worker.env admin-worker.inspect.json admin-docker-disk-proof.json; do
  if grep -E -i '(password|passwd|token|secret|authorization|cookie|set-cookie|bearer|api[_-]?key|access[_-]?key|private[_-]?key|asr)' "$RETURNED_DIR/$file" >/dev/null 2>&1; then
    die "returned evidence appears to contain sensitive fields: $file"
  fi
done

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../../../.." && pwd)"
cd "$REPO_ROOT"

npm run precheck:admin-docker-nas-returned-evidence -- "$RETURNED_DIR"

MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR="$RETURNED_DIR" \
MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT='docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T231236Z.json' \
MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_PROOF_REPORT='docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T231223Z.json' \
MIXLAB_ACCEPTANCE_OUTPUT_DIR=docs/acceptance/artifacts \
MIXLAB_ACCEPTANCE_ARTIFACT_DIR=docs/acceptance/artifacts \
npm run intake:admin-docker-nas-release-inputs -- "$RETURNED_DIR"

npm run validate:admin-docker-release-readiness-summary
