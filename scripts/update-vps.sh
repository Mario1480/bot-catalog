#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BRANCH="main"
SKIP_PULL=0
SKIP_BUILD=0
SKIP_MIGRATIONS=0
ALLOW_DIRTY=0

log() {
  printf '[update-vps] %s\n' "$*"
}

die() {
  printf '[update-vps] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: scripts/update-vps.sh [options]

Options:
  --branch <name>       Git branch to deploy (default: main)
  --skip-pull           Skip git fetch/pull
  --skip-build          Skip docker image build (uses existing images)
  --skip-migrations     Skip database migrations
  --allow-dirty         Allow running with local git changes
  -h, --help            Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      [[ $# -lt 2 ]] && die "--branch requires a value"
      BRANCH="$2"
      shift 2
      ;;
    --skip-pull)
      SKIP_PULL=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --skip-migrations)
      SKIP_MIGRATIONS=1
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

command -v git >/dev/null 2>&1 || die "git is required"
command -v docker >/dev/null 2>&1 || die "docker is required"

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  die "docker compose (or docker-compose) is required"
fi

[[ -f .env ]] || die ".env not found in $ROOT_DIR"
[[ -f docker-compose.yml ]] || die "docker-compose.yml not found in $ROOT_DIR"

if [[ "$ALLOW_DIRTY" -ne 1 ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    die "Repository has local changes. Commit/stash them or pass --allow-dirty."
  fi
fi

if [[ "$SKIP_PULL" -ne 1 ]]; then
  log "Fetching latest changes"
  git fetch --all --prune

  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" != "$BRANCH" ]]; then
    log "Switching branch: $current_branch -> $BRANCH"
    git checkout "$BRANCH"
  fi

  log "Pulling origin/$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

log "Starting containers"
if [[ "$SKIP_BUILD" -eq 1 ]]; then
  "${COMPOSE_CMD[@]}" --env-file .env -f docker-compose.yml up -d
else
  "${COMPOSE_CMD[@]}" --env-file .env -f docker-compose.yml up -d --build
fi

wait_for_db() {
  local attempts=40
  local i
  for ((i=1; i<=attempts; i++)); do
    if "${COMPOSE_CMD[@]}" --env-file .env -f docker-compose.yml exec -T db \
      pg_isready -U catalog -d catalog >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

sql_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

run_migrations() {
  log "Waiting for database to be ready"
  wait_for_db || die "Database not ready after timeout"

  log "Ensuring schema_migrations table exists"
  "${COMPOSE_CMD[@]}" --env-file .env -f docker-compose.yml exec -T db \
    psql -v ON_ERROR_STOP=1 -U catalog -d catalog <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

  shopt -s nullglob
  local files=(apps/api/migrations/*.sql)
  shopt -u nullglob

  if [[ ${#files[@]} -eq 0 ]]; then
    log "No migration files found in apps/api/migrations"
    return 0
  fi

  for file in "${files[@]}"; do
    local name
    local escaped
    local already_applied

    name="$(basename "$file")"
    escaped="$(sql_escape "$name")"

    already_applied="$(
      "${COMPOSE_CMD[@]}" --env-file .env -f docker-compose.yml exec -T db \
        psql -U catalog -d catalog -tAc \
        "SELECT 1 FROM schema_migrations WHERE name = '$escaped' LIMIT 1;"
    )"

    if [[ "$already_applied" == "1" ]]; then
      log "Migration already applied: $name"
      continue
    fi

    log "Applying migration: $name"
    "${COMPOSE_CMD[@]}" --env-file .env -f docker-compose.yml exec -T db \
      psql -v ON_ERROR_STOP=1 -U catalog -d catalog < "$file"

    "${COMPOSE_CMD[@]}" --env-file .env -f docker-compose.yml exec -T db \
      psql -v ON_ERROR_STOP=1 -U catalog -d catalog -c \
      "INSERT INTO schema_migrations (name) VALUES ('$escaped') ON CONFLICT (name) DO NOTHING;"
  done
}

if [[ "$SKIP_MIGRATIONS" -ne 1 ]]; then
  run_migrations
else
  log "Skipping migrations (--skip-migrations)"
fi

if command -v curl >/dev/null 2>&1; then
  log "Checking API health"
  health_ok=0
  for _ in {1..30}; do
    if curl -fsS "http://localhost:4000/health" >/dev/null 2>&1; then
      health_ok=1
      break
    fi
    sleep 2
  done
  if [[ "$health_ok" -eq 1 ]]; then
    log "API health check passed"
  else
    log "API health check failed (http://localhost:4000/health)"
  fi
fi

log "Container status"
"${COMPOSE_CMD[@]}" --env-file .env -f docker-compose.yml ps

log "Update completed"
