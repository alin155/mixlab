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

need_cmd docker
need_file "$COMPOSE_FILE"
need_file "$ENV_FILE"
mkdir -p "$OUT_DIR"

if ! grep '^MIXLAB_IMAGE_TAG=' "$ENV_FILE" > "$OUT_DIR/admin-docker-current.env"; then
  die "MIXLAB_IMAGE_TAG is missing from $ENV_FILE"
fi

write_current_admin_image_inspect "$OUT_DIR/admin-docker-current.inspect.json"
write_worker_env "$OUT_DIR/admin-worker.env"
write_worker_sanitized_inspect "$OUT_DIR/admin-worker.inspect.json"

cat <<EOF
Generated sanitized Admin Docker release-input evidence:
- $OUT_DIR/admin-docker-current.env
- $OUT_DIR/admin-docker-current.inspect.json
- $OUT_DIR/admin-worker.env
- $OUT_DIR/admin-worker.inspect.json

Copy this output directory to the Mac repo, then run:
MIXLAB_ADMIN_DOCKER_NAS_ENV_FILE=<path>/admin-docker-current.env \\
MIXLAB_ADMIN_DOCKER_NAS_INSPECT_JSON=<path>/admin-docker-current.inspect.json \\
npm run validate:admin-docker-nas-image-proof

MIXLAB_ADMIN_WORKER_ENV_FILE=<path>/admin-worker.env \\
MIXLAB_ADMIN_WORKER_INSPECT_JSON=<path>/admin-worker.inspect.json \\
npm run validate:admin-worker-env-proof
EOF
