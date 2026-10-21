#!/usr/bin/env bash
# Start the shared GreenChain demo stack on this machine, with evidence in S3 Object Lock.
#
#   ./deploy/demo_up.sh            # build, start, migrate, seed, check, print the URL
#   ./deploy/demo_up.sh down       # stop (data and S3 evidence are kept)
#   ./deploy/demo_up.sh reset      # stop and EMPTY the demo database and local evidence volume
#                                  # (asks you to type RESET first; never touches S3)
#
# Needs: Docker Desktop running, deploy/.env.demo (copy deploy/demo.env.example), and an
# AWS profile in ~/.aws with the least-privilege evidence policy. See docs/SHARED_DEMO_BACKEND.md.
#
# With DEMO_SEED_DATA=true in deploy/.env.demo, startup also loads the Monosh demonstration
# (2 buildings, 5 approved quarterly submissions; synthetic data, simulated approvals). The seed
# is idempotent, so restarting never duplicates it, and the backend refuses it in production.

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=deploy/.env.demo
# Own project name so the demo stack never shares containers with the local dev
# `docker compose up -d postgres` (both define a service called postgres).
COMPOSE=(docker compose -p greenchain-demo --env-file "$ENV_FILE" -f docker-compose.prod.yml -f docker-compose.s3.yml -f docker-compose.lan.yml)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy deploy/demo.env.example and fill it in." >&2
  exit 1
fi

# The named volumes this stack actually mounts, read from the resolved Compose
# configuration rather than assumed, so a reset can only ever touch these.
demo_volumes() {
  "${COMPOSE[@]}" config --format json | python3 -c '
import json, sys
config = json.load(sys.stdin)
for key, volume in sorted((config.get("volumes") or {}).items()):
    print(volume.get("name") or key)
'
}

case "${1:-up}" in
  down)
    "${COMPOSE[@]}" down
    exit 0
    ;;
  reset)
    volumes=$(demo_volumes)
    if [[ -z "$volumes" ]]; then
      echo "Could not read the stack's volume names from Docker Compose; nothing was changed." >&2
      exit 1
    fi
    set -a; . "$ENV_FILE"; set +a
    echo "This permanently deletes every building, upload, review and account in the demo database."
    echo "Docker volumes that will be emptied (nothing else is touched):"
    for volume in $volumes; do
      if docker volume inspect "$volume" >/dev/null 2>&1; then echo "  - $volume"; else echo "  - $volume (does not exist yet)"; fi
    done
    echo "S3 is NOT touched: locked evidence stays in s3://${S3_BUCKET:-?}/${S3_KEY_PREFIX:-} until its retention ends."
    echo "Use a new S3_KEY_PREFIX in $ENV_FILE for the fresh deployment so its evidence is kept separate."
    if [[ ! -t 0 ]]; then
      echo "Refusing to reset without an interactive confirmation." >&2
      exit 1
    fi
    read -r -p "Type RESET to continue: " answer
    if [[ "$answer" != "RESET" ]]; then
      echo "Cancelled; nothing was changed."
      exit 1
    fi
    "${COMPOSE[@]}" down
    for volume in $volumes; do
      if docker volume inspect "$volume" >/dev/null 2>&1; then
        docker volume rm "$volume" >/dev/null && echo "Removed $volume"
      fi
      docker volume create "$volume" >/dev/null && echo "Created empty $volume"
    done
    echo "Reset complete. Start it with: ./deploy/demo_up.sh"
    exit 0
    ;;
  up) ;;
  *)
    echo "Usage: $0 [up|down|reset]" >&2
    exit 1
    ;;
esac

set -a; . "$ENV_FILE"; set +a

# The stack's volumes are declared external (shared with the earlier project name), so a
# new machine has to have them before Compose will start. Creating one that exists is a no-op.
for volume in $(demo_volumes); do
  docker volume inspect "$volume" >/dev/null 2>&1 || { docker volume create "$volume" >/dev/null && echo "Created volume $volume"; }
done

echo "==> Building frontend (API served same-origin under /api)"
# Separate output directory: a routine `npm run build` (which targets the local dev API) must
# never overwrite what the shared site serves.
VITE_API_BASE_URL=/api npm run build -- --outDir deploy/.demo-dist --emptyOutDir >/dev/null

echo "==> Starting PostgreSQL, API (S3 evidence) and nginx"
"${COMPOSE[@]}" up -d --build

echo "==> Migrating and seeding"
"${COMPOSE[@]}" exec -T api alembic upgrade head
"${COMPOSE[@]}" exec -T api python -m backend.app.scripts.seed_auth
"${COMPOSE[@]}" exec -T api python -m backend.app.scripts.setup_storage

if [[ "${DEMO_SEED_DATA:-false}" == "true" ]]; then
  echo "==> Loading the Monosh demonstration (synthetic data, simulated approvals)"
  "${COMPOSE[@]}" exec -T api python -m backend.app.scripts.seed_demo_monosh
fi

echo "==> Readiness"
for _ in $(seq 1 20); do
  if curl -fsS "$FRONTEND_ORIGIN/api/health/ready"; then echo; break; fi
  sleep 2
done

cat <<MSG

GreenChain is running. Teammates on the same network open:
    $FRONTEND_ORIGIN
Sign in by choosing an account from the dropdown (no password; demo only).
Every upload is stored in s3://$S3_BUCKET/${S3_KEY_PREFIX:-}... with $S3_OBJECT_LOCK_MODE retention for $S3_RETENTION_DAYS day(s).
Stop with: ./deploy/demo_up.sh down
MSG
