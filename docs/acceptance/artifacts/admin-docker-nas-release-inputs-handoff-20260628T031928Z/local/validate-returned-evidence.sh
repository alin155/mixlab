#!/usr/bin/env sh
set -eu

RETURNED_DIR="${1:-${MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR:-}}"
if [ -z "$RETURNED_DIR" ]; then
  echo "usage: sh ./validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../../../.." && pwd)"
cd "$REPO_ROOT"

MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR="$RETURNED_DIR" \
MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT='docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T031912Z.json' \
MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_PROOF_REPORT='docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T031823Z.json' \
MIXLAB_ACCEPTANCE_OUTPUT_DIR=docs/acceptance/artifacts \
MIXLAB_ACCEPTANCE_ARTIFACT_DIR=docs/acceptance/artifacts \
npm run intake:admin-docker-nas-release-inputs -- "$RETURNED_DIR"
