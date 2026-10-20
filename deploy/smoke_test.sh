#!/usr/bin/env bash
# GreenChain deployment smoke test (Sprint 9).
#
# Exercises the acceptance journey against a RUNNING backend:
#   health -> login -> upload -> unreviewed -> approve -> approved metrics -> insights
# plus the negative cases that matter: anonymous access denied, wrong role
# denied, malformed upload rejected.
#
# Usage:  ./deploy/smoke_test.sh [base_url] [password]
# Example: ./deploy/smoke_test.sh http://localhost:8000 devpassword
#
# Exits non-zero on the first failure so it can gate a deploy.

set -uo pipefail

BASE="${1:-http://localhost:8000}"
PASSWORD="${2:-${DEV_SEED_PASSWORD:-devpassword}}"
JAR="$(mktemp -t greenchain-smoke-XXXX)"
WORK="$(mktemp -d -t greenchain-smoke-XXXX)"
PERIOD="${SMOKE_PERIOD:-2026-Q4}"
PROJECT="${SMOKE_PROJECT:-Smoke Test Building}"
PASS=0; FAIL=0

cleanup() { rm -rf "$JAR" "$WORK"; }
trap cleanup EXIT

ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL+1)); }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected $2, got $3)"; fi
}

login() { # login <email>  -> fresh cookie jar
  rm -f "$JAR"
  curl -sS -o /dev/null -c "$JAR" -X POST "$BASE/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}" -w '%{http_code}'
}

code() { # code <method> <path> [curl args...]
  local method="$1" path="$2"; shift 2
  curl -sS -o /dev/null -b "$JAR" -X "$method" "$BASE$path" "$@" -w '%{http_code}'
}

body() { curl -sS -b "$JAR" "$BASE$1"; }

printf '\033[1mGreenChain smoke test\033[0m  target=%s\n' "$BASE"

step '1. Health'
check "liveness returns 200"  200 "$(curl -sS -o /dev/null "$BASE/health" -w '%{http_code}')"
check "readiness returns 200" 200 "$(curl -sS -o /dev/null "$BASE/health/ready" -w '%{http_code}')"

step '2. Anonymous access is denied'
rm -f "$JAR"; : > "$JAR"
check "projects rejects anonymous"   401 "$(code GET /projects)"
check "pending queue rejects anon"   401 "$(code GET /reviews/submissions/pending)"

step '3. Login'
check "company can log in" 200 "$(login sonwoy@greenchain.test)"

step '4. Role boundaries'
check "company cannot review" 403 "$(code GET /reviews/submissions/pending)"

step '5. Malformed upload is rejected'
printf 'not,a,valid\nsustainability,file,here\n' > "$WORK/bad.csv"
check "missing required columns rejected" 400 \
  "$(code POST /submissions -F "project_name=$PROJECT" -F "organisation=Smoke Org" \
       -F "reporting_period=$PERIOD" -F "file=@$WORK/bad.csv;type=text/csv")"
printf 'x' > "$WORK/bad.txt"
check "unsupported extension rejected" 400 \
  "$(code POST /submissions -F "project_name=$PROJECT" -F "organisation=Smoke Org" \
       -F "reporting_period=$PERIOD" -F "file=@$WORK/bad.txt;type=text/plain")"

step '6. Valid upload'
cat > "$WORK/good.csv" <<CSV
metric_name,value,unit,category
Electricity,91000,kWh,Energy
Water,3100,m3,Water
CO2e,46,tCO2e,Emissions
CSV
UPLOAD="$(curl -sS -b "$JAR" -X POST "$BASE/submissions" \
  -F "project_name=$PROJECT" -F "organisation=Smoke Org" \
  -F "reporting_period=$PERIOD" -F "file=@$WORK/good.csv;type=text/csv")"
SUBMISSION_ID="$(printf '%s' "$UPLOAD" | sed -n 's/.*"submission_id":[[:space:]]*\([0-9]*\).*/\1/p')"
if [ -n "$SUBMISSION_ID" ]; then ok "upload accepted (submission #$SUBMISSION_ID)"; else bad "upload did not return a submission id: $UPLOAD"; fi
# POST /submissions returns only submission_id/status/message, so the project id
# is read back from submission detail. If the upload response ever carries
# project_id directly, this round-trip can go away.
PROJECT_ID="$(body "/submissions/$SUBMISSION_ID" | sed -n 's/.*"project_id":[[:space:]]*\([0-9]*\).*/\1/p')"
if [ -n "$PROJECT_ID" ]; then ok "submission detail resolves project #$PROJECT_ID"; else bad "could not resolve project id from submission detail"; fi
case "$UPLOAD" in *UNREVIEWED*) ok "new submission starts UNREVIEWED";; *) bad "new submission is not UNREVIEWED";; esac

step '7. Review'
check "auditor can log in" 200 "$(login auditor@greenchain.test)"
check "auditor cannot upload" 403 \
  "$(code POST /submissions -F "project_name=$PROJECT" -F "organisation=Smoke Org" \
       -F "reporting_period=$PERIOD" -F "file=@$WORK/good.csv;type=text/csv")"
case "$(body /reviews/submissions/pending)" in
  *"\"submission_id\":$SUBMISSION_ID"*) ok "submission appears in the pending queue";;
  *) bad "submission $SUBMISSION_ID missing from pending queue";;
esac
check "approve succeeds" 200 \
  "$(code POST "/reviews/submissions/$SUBMISSION_ID/decision" \
       -H 'Content-Type: application/json' -d '{"decision":"APPROVED","reason":"smoke test"}')"
check "re-approving a decided submission is refused" 409 \
  "$(code POST "/reviews/submissions/$SUBMISSION_ID/decision" \
       -H 'Content-Type: application/json' -d '{"decision":"APPROVED","reason":"again"}')"

step '8. Approved data is visible'
check "viewer can log in" 200 "$(login viewer@greenchain.test)"
case "$(body "/projects/$PROJECT_ID")" in
  *Electricity*) ok "approved electricity appears on project detail";;
  *) bad "approved metric missing from project detail";;
esac
case "$(body "/projects/$PROJECT_ID/metrics/Electricity/history")" in
  *91000*) ok "metric history returns the approved value";;
  *) bad "metric history missing the approved value";;
esac

step '9. Insights'
check "benchmarks endpoint responds"  200 "$(code GET "/insights/projects/$PROJECT_ID/benchmarks")"
check "consistency endpoint responds" 200 "$(code GET "/insights/projects/$PROJECT_ID/consistency")"
case "$(body "/insights/projects/$PROJECT_ID/benchmarks")" in
  *PROJECT_SCOPE_UNKNOWN*) ok "unscoped project reports PROJECT_SCOPE_UNKNOWN rather than guessing";;
  *classification*)        ok "benchmark comparison returned a classification";;
  *) bad "benchmarks returned no comparison and no reason";;
esac

printf '\n\033[1mResult:\033[0m %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
