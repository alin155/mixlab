#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${MIXLAB_NAS_COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${MIXLAB_NAS_ENV_FILE:-.env}"
OUT_DIR="${1:-${MIXLAB_NAS_RELEASE_INPUT_OUTPUT_DIR:-admin-docker-release-inputs}}"

die() {
  printf '%s\n' "error: $*" >&2
  exit 1
}

need_file() {
  [ -f "$1" ] || die "missing required file: $1"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

container_id_for_service() {
  service="$1"
  id="$(compose ps -q "$service" | head -n 1)"
  [ -n "$id" ] || die "service is not running or not found: $service"
  printf '%s' "$id"
}

inspect_value() {
  container_id="$1"
  format="$2"
  docker inspect --format "$format" "$container_id"
}

env_value_from_inspect() {
  container_id="$1"
  key="$2"
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_id" |
    awk -v key="$key" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }'
}

env_file_value() {
  key="$1"
  awk -F= -v key="$key" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "$ENV_FILE"
}

df_line_for_host_path() {
  path="$1"
  df -Pk "$path" | awk 'NR == 2 { gsub(/%/, "", $5); printf "%s\t%s\t%s\t%s\t%s\n", $1, $2, $3, $4, $5 }'
}

df_line_for_service_path() {
  service="$1"
  path="$2"
  compose exec -T "$service" sh -lc "df -Pk '$path'" |
    awk 'NR == 2 { gsub(/%/, "", $5); printf "%s\t%s\t%s\t%s\t%s\n", $1, $2, $3, $4, $5 }'
}

write_disk_check_object() {
  id="$1"
  scope="$2"
  service="$3"
  check_path="$4"
  line="$5"
  filesystem="$(printf '%s\n' "$line" | awk -F '\t' '{ print $1 }')"
  total_1k="$(printf '%s\n' "$line" | awk -F '\t' '{ print $2 }')"
  used_1k="$(printf '%s\n' "$line" | awk -F '\t' '{ print $3 }')"
  available_1k="$(printf '%s\n' "$line" | awk -F '\t' '{ print $4 }')"
  usage_percent="$(printf '%s\n' "$line" | awk -F '\t' '{ print $5 }')"

  printf '{"id":"%s","scope":"%s","service":"%s","path":"%s","filesystem":"%s","total_1k_blocks":%s,"used_1k_blocks":%s,"available_1k_blocks":%s,"usage_percent":%s}' \
    "$(json_escape "$id")" \
    "$(json_escape "$scope")" \
    "$(json_escape "$service")" \
    "$(json_escape "$check_path")" \
    "$(json_escape "$filesystem")" \
    "${total_1k:-0}" \
    "${used_1k:-0}" \
    "${available_1k:-0}" \
    "${usage_percent:-0}"
}

write_disk_proof() {
  output="$1"
  expected_root="/data/PublicLibrary"
  attention="$(env_file_value MIXLAB_PREPROCESS_DISK_ATTENTION_USAGE_PERCENT || true)"
  block="$(env_file_value MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT || true)"
  host_path="$(env_file_value PUBLIC_LIBRARY_HOST_PATH || true)"
  [ -n "$attention" ] || attention="87"
  [ -n "$block" ] || block="92"
  api_line="$(df_line_for_service_path admin-api "$expected_root")"
  worker_line="$(df_line_for_service_path admin-worker "$expected_root")"
  host_line=""
  if [ -n "$host_path" ] && [ -d "$host_path" ]; then
    host_line="$(df_line_for_host_path "$host_path")"
  fi

  {
    printf '{\n'
    printf '  "schema_version": "1.0",\n'
    printf '  "mode": "admin-docker-nas-release-inputs-collector",\n'
    printf '  "collected_at": "%s",\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf '  "expected_library_root": "%s",\n' "$expected_root"
    printf '  "thresholds": {"attention_usage_percent": %s, "block_usage_percent": %s},\n' "$attention" "$block"
    printf '  "checks": [\n'
    printf '    '
    write_disk_check_object admin-api-library-root container admin-api "$expected_root" "$api_line"
    printf ',\n    '
    write_disk_check_object admin-worker-library-root container admin-worker "$expected_root" "$worker_line"
    if [ -n "$host_line" ]; then
      printf ',\n    '
      write_disk_check_object host-public-library host "" "$host_path" "$host_line"
    fi
    printf '\n  ]\n'
    printf '}\n'
  } > "$output"
}

write_service_image_object() {
  service="$1"
  container_id="$(container_id_for_service "$service")"
  name="$(inspect_value "$container_id" '{{.Name}}')"
  image="$(inspect_value "$container_id" '{{.Config.Image}}')"
  compose_service="$(inspect_value "$container_id" '{{index .Config.Labels "com.docker.compose.service"}}')"
  if [ -z "$compose_service" ] || [ "$compose_service" = "<no value>" ]; then
    compose_service="$service"
  fi

  printf '{"Name":"%s","Config":{"Image":"%s","Labels":{"com.docker.compose.service":"%s"}}}' \
    "$(json_escape "$name")" \
    "$(json_escape "$image")" \
    "$(json_escape "$compose_service")"
}

write_current_admin_image_inspect() {
  output="$1"
  {
    printf '[\n  '
    write_service_image_object admin-web
    printf ',\n  '
    write_service_image_object admin-api
    printf ',\n  '
    write_service_image_object admin-worker
    printf '\n]\n'
  } > "$output"
}

write_worker_env() {
  output="$1"
  compose exec -T admin-worker sh -lc 'printf "%s\n" "MIXLAB_ADMIN_DOCKER_MVP_MODE=${MIXLAB_ADMIN_DOCKER_MVP_MODE:-}" "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=${MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER:-}" "MIXLAB_ENABLE_READY_PUBLISH_WORKER=${MIXLAB_ENABLE_READY_PUBLISH_WORKER:-}"' > "$output"
}

write_worker_sanitized_inspect() {
  output="$1"
  container_id="$(container_id_for_service admin-worker)"
  name="$(inspect_value "$container_id" '{{.Name}}')"
  image="$(inspect_value "$container_id" '{{.Config.Image}}')"
  mvp_mode="$(env_value_from_inspect "$container_id" MIXLAB_ADMIN_DOCKER_MVP_MODE)"
  preprocess_worker="$(env_value_from_inspect "$container_id" MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER)"
  publish_worker="$(env_value_from_inspect "$container_id" MIXLAB_ENABLE_READY_PUBLISH_WORKER)"
  admin_root="$(env_value_from_inspect "$container_id" MIXLAB_ADMIN_LIBRARY_ROOT)"
  preprocess_root="$(env_value_from_inspect "$container_id" MIXLAB_PREPROCESS_LIBRARY_ROOT)"

  {
    printf '[\n'
    printf '  {"Name":"%s","Config":{"Image":"%s","Env":[' \
      "$(json_escape "$name")" \
      "$(json_escape "$image")"
    printf '"MIXLAB_ADMIN_DOCKER_MVP_MODE=%s",' "$(json_escape "$mvp_mode")"
    printf '"MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=%s",' "$(json_escape "$preprocess_worker")"
    printf '"MIXLAB_ENABLE_READY_PUBLISH_WORKER=%s",' "$(json_escape "$publish_worker")"
    printf '"MIXLAB_ADMIN_LIBRARY_ROOT=%s",' "$(json_escape "$admin_root")"
    printf '"MIXLAB_PREPROCESS_LIBRARY_ROOT=%s"' "$(json_escape "$preprocess_root")"
    printf ']}}\n'
    printf ']\n'
  } > "$output"
}

file_size_bytes() {
  file="$1"
  if [ -f "$file" ]; then
    wc -c < "$file" | awk '{ print $1 }'
  else
    printf '0'
  fi
}

write_returned_file_entry() {
  output_dir="$1"
  file="$2"
  path="$output_dir/$file"
  if [ -f "$path" ]; then
    printf 'file=%s present=true size_bytes=%s\n' "$file" "$(file_size_bytes "$path")"
  else
    printf 'file=%s present=false size_bytes=0\n' "$file"
  fi
}

write_returned_manifest() {
  output="$1"
  collected_at="$2"
  output_dir="$(dirname "$output")"

  {
    printf 'schema_version=1.0\n'
    printf 'mode=admin-docker-nas-release-inputs-collector\n'
    printf 'collected_at=%s\n' "$collected_at"
    printf 'push_execution_allowed=false\n'
    printf 'docker_deploy_allowed=false\n'
    printf 'nas_writes_allowed=false\n'
    printf 'worker_start_allowed=false\n'
    printf 'secret_sanitization=sanitized-only\n'
    printf 'forbidden_full_env=true\n'
    printf 'forbidden_full_docker_inspect=true\n'
    printf 'forbidden_secrets=true\n'
    write_returned_file_entry "$output_dir" admin-docker-current.env
    write_returned_file_entry "$output_dir" admin-docker-current.inspect.json
    write_returned_file_entry "$output_dir" admin-worker.env
    write_returned_file_entry "$output_dir" admin-worker.inspect.json
    write_returned_file_entry "$output_dir" admin-docker-disk-proof.json
    write_returned_file_entry "$output_dir" README.md
    printf 'manifest_file=MANIFEST.txt\n'
  } > "$output"
}

write_returned_readme() {
  output="$1"

  cat > "$output" <<'EOF'
# Admin Docker NAS Release Inputs

This directory contains sanitized returned evidence from the NAS Compose
project. It is only for local release-input validation in the Mac repository.

Required files:
- admin-docker-current.env
- admin-docker-current.inspect.json
- admin-worker.env
- admin-worker.inspect.json
- admin-docker-disk-proof.json
- MANIFEST.txt
- README.md

Local validation from the Mac repository:

```sh
sh docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest/local/validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>

MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR=<copied-admin-docker-release-inputs-dir> \
  npm run intake:admin-docker-nas-release-inputs
```

Safety rules:
- This evidence is read-only and must not change NAS data or containers.
- Do not run push_images=true from this directory.
- Do not edit NAS .env from this workflow.
- Do not restart NAS containers from this workflow.
- Do not enable preprocess or publish workers from this workflow.
- Do not run scan, index repair, preprocess, publish, or cleanup actions from this workflow.

Secret and raw-output rules:
- Do not copy full .env into this directory.
- Do not copy full docker inspect output into this directory.
- Do not add API keys, bearer tokens, passwords, ASR credentials, or private NAS account data.
- Keep only the sanitized files generated by admin-docker-nas-release-inputs-collector.sh.
EOF
}

need_cmd docker
need_file "$COMPOSE_FILE"
need_file "$ENV_FILE"
mkdir -p "$OUT_DIR"
COLLECTED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

if ! grep '^MIXLAB_IMAGE_TAG=' "$ENV_FILE" > "$OUT_DIR/admin-docker-current.env"; then
  die "MIXLAB_IMAGE_TAG is missing from $ENV_FILE"
fi

write_current_admin_image_inspect "$OUT_DIR/admin-docker-current.inspect.json"
write_worker_env "$OUT_DIR/admin-worker.env"
write_worker_sanitized_inspect "$OUT_DIR/admin-worker.inspect.json"
write_disk_proof "$OUT_DIR/admin-docker-disk-proof.json"
write_returned_readme "$OUT_DIR/README.md"
write_returned_manifest "$OUT_DIR/MANIFEST.txt" "$COLLECTED_AT"

cat <<EOF
Generated sanitized Admin Docker release-input evidence:
- $OUT_DIR/admin-docker-current.env
- $OUT_DIR/admin-docker-current.inspect.json
- $OUT_DIR/admin-worker.env
- $OUT_DIR/admin-worker.inspect.json
- $OUT_DIR/admin-docker-disk-proof.json
- $OUT_DIR/README.md
- $OUT_DIR/MANIFEST.txt

Copy this output directory to the Mac repo, then run:
sh docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest/local/validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>

MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR=<copied-admin-docker-release-inputs-dir> \\
npm run intake:admin-docker-nas-release-inputs

MIXLAB_ADMIN_DOCKER_NAS_ENV_FILE=<path>/admin-docker-current.env \\
MIXLAB_ADMIN_DOCKER_NAS_INSPECT_JSON=<path>/admin-docker-current.inspect.json \\
npm run validate:admin-docker-nas-image-proof

MIXLAB_ADMIN_WORKER_ENV_FILE=<path>/admin-worker.env \\
MIXLAB_ADMIN_WORKER_INSPECT_JSON=<path>/admin-worker.inspect.json \\
npm run validate:admin-worker-env-proof

MIXLAB_ADMIN_DOCKER_NAS_DISK_PROOF_JSON=<path>/admin-docker-disk-proof.json \\
npm run validate:admin-docker-nas-disk-proof

This collector is read-only evidence collection. Do not edit NAS .env, restart
NAS containers, enable workers, or run push_images=true from these instructions.
The admin-worker proof must show MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0 and
MIXLAB_ENABLE_READY_PUBLISH_WORKER=0 before any Docker upload or staging
decision.

After those proof reports exist, generate release inputs and bind them into the
staging runbook from the Mac repo:
MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT=<path>/admin-docker-prestaging-handoff-*.json \\
MIXLAB_ADMIN_DOCKER_NAS_IMAGE_PROOF_REPORT=<path>/admin-docker-nas-image-proof-*.json \\
npm run validate:admin-docker-release-inputs

MIXLAB_ADMIN_DOCKER_RELEASE_INPUTS_REPORT=<path>/admin-docker-release-inputs-*.json \\
MIXLAB_ADMIN_DOCKER_NAS_DISK_PROOF_REPORT=<path>/admin-docker-nas-disk-proof-*.json \\
MIXLAB_DOCKER_CURRENT_IMAGE_TAG=<current-admin-docker-image-tag> \\
MIXLAB_DOCKER_TARGET_IMAGE_TAG=<candidate-40-char-commit-sha> \\
MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG=<same-as-current-image-tag> \\
npm run validate:admin-docker-staging-runbook

Stop before staging execution if release_inputs_ready=false,
staging_execution_ready=false, or the staging runbook carries
nas-disk-risk-carried-forward.
EOF
