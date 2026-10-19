#!/usr/bin/env bash
# Start the shared GreenChain demo stack on this machine, with evidence in S3 Object Lock.
#
#   ./deploy/demo_up.sh            # build, start, migrate, seed, check, print the URL
#   ./deploy/demo_up.sh down       # stop (data and S3 evidence are kept)
#
# Needs: Docker Desktop running, deploy/.env.demo (copy deploy/demo.env.example), and an
# AWS profile in ~/.aws with the least-privilege evidence policy. See docs/SHARED_DEMO_BACKEND.md.

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=deploy/.env.demo
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml -f docker-compose.s3.yml -f docker-compose.lan.yml)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy deploy/demo.env.example and fill it in." >&2
  exit 1
fi

if [[ "${1:-up}" == "down" ]]; then
  "${COMPOSE[@]}" down
  exit 0
fi

set -a; . "$ENV_FILE"; set +a

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

echo "==> Readiness"
for _ in $(seq 1 20); do
  if curl -fsS "$FRONTEND_ORIGIN/api/health/ready"; then echo; break; fi
  sleep 2
done

cat <<EOF

GreenChain is running. Teammates on the same network open:
    $FRONTEND_ORIGIN
Sign in by choosing an account from the dropdown (no password; demo only).
Every upload is stored in s3://$S3_BUCKET/${S3_KEY_PREFIX:-}... with $S3_OBJECT_LOCK_MODE retention for $S3_RETENTION_DAYS day(s).
Stop with: ./deploy/demo_up.sh down
EOF
