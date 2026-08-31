#!/usr/bin/env bash
# Sync local Supabase keys into backend/.env and frontend/.env
# Usage: bash scripts/sync-supabase-env.sh
# Requires: `npx supabase start` already running

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! npx supabase status -o env >/tmp/supabase_env 2>/dev/null; then
  echo "Supabase is not running. Start it first:"
  echo "  npx supabase start"
  exit 1
fi

# shellcheck source=/dev/null
set -a
source /tmp/supabase_env
set +a

ANON_KEY="${ANON_KEY:-}"
SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-}"
JWT_SECRET="${JWT_SECRET:-}"
API_URL="${API_URL:-http://127.0.0.1:54321}"

if [[ -z "$ANON_KEY" || -z "$SERVICE_ROLE_KEY" ]]; then
  echo "Could not read supabase keys from status. Try: npx supabase status -o env"
  exit 1
fi

echo "Supabase local: $API_URL"
echo "  ANON_KEY: ${ANON_KEY:0:20}..."
echo "  JWT_SECRET: ${JWT_SECRET:0:10}..."

BACKUP_DIR="/tmp/manzil-os-env-backups"
mkdir -p "$BACKUP_DIR"

# --- backend/.env ---
BACKEND_ENV="$ROOT/backend/.env"
if [[ ! -f "$BACKEND_ENV" ]]; then
  cp "$ROOT/backend/.env.example" "$BACKEND_ENV"
fi
# Keep backups outside app folders. Vite may load frontend/.env.* files.
cp "$BACKEND_ENV" "$BACKUP_DIR/backend.env.$(date +%s)"

# Replace or append SUPABASE_* lines (preserve DATABASE_URL)
python3 - <<PY
import pathlib, re
p = pathlib.Path("$BACKEND_ENV")
text = p.read_text()
def upsert(key, val):
    global text
    line = f'{key}="{val}"'
    if re.search(rf'^{key}=', text, flags=re.M):
        text = re.sub(rf'^{key}=.*', line, text, flags=re.M)
    else:
        text = text.rstrip() + "\n" + line + "\n"
upsert("SUPABASE_URL", "$API_URL")
upsert("SUPABASE_ANON_KEY", "$ANON_KEY")
upsert("SUPABASE_SERVICE_ROLE_KEY", "$SERVICE_ROLE_KEY")
upsert("SUPABASE_JWT_SECRET", "$JWT_SECRET")
# Remove SUPABASE_TEST_OTP if present (test_otp in supabase/config.toml covers local)
text = re.sub(r'^SUPABASE_TEST_OTP=.*\n?', '', text, flags=re.M)
p.write_text(text)
print("Wrote", p)
PY

# --- frontend/.env ---
FRONTEND_ENV="$ROOT/frontend/.env"
if [[ ! -f "$FRONTEND_ENV" ]]; then
  cp "$ROOT/frontend/.env.example" "$FRONTEND_ENV"
fi
# Keep backups outside app folders. Vite may load frontend/.env.* files.
cp "$FRONTEND_ENV" "$BACKUP_DIR/frontend.env.$(date +%s)"

python3 - <<PY
import pathlib, re
p = pathlib.Path("$FRONTEND_ENV")
text = p.read_text()
def upsert(key, val):
    global text
    line = f'{key}={val}'
    if re.search(rf'^{key}=', text, flags=re.M):
        text = re.sub(rf'^{key}=.*', line, text, flags=re.M)
    else:
        text = text.rstrip() + "\n" + line + "\n"
upsert("VITE_SUPABASE_URL", "$API_URL")
upsert("VITE_SUPABASE_ANON_KEY", "$ANON_KEY")
p.write_text(text)
print("Wrote", p)
PY

echo ""
echo "Done. Backups saved in $BACKUP_DIR"
echo "Next:"
echo "  1. cd backend && uv run dev        # http://127.0.0.1:8000"
echo "  2. cd frontend && npm run dev      # http://127.0.0.1:5173"
echo "  3. Login with any test phone (OTP 123456), e.g. +919000000000"
echo "     Numbers in supabase/config.toml [auth.sms.test_otp] bypass real SMS."
