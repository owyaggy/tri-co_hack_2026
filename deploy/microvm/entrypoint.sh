#!/bin/sh
# PID 1 on the MicroVM: seeds the database on first boot, runs uvicorn on $PORT,
# restarts it if it exits, and reseeds once a day when the site is quiet.
#
# This must never exit: on a MicroVM the workload ending is final (DO still says
# `running`, but `exec` is refused and nothing brings it back; see the Agent Box
# note). So no `set -e`; failures are logged and retried.
#
# Settings come from the environment (`doctl compute microvm create --env ...`),
# or from /var/lib/dialectic/env (KEY=value lines) if that file exists, which can
# be written with `doctl compute microvm exec` when --env isn't usable.
#
# Reseeding: `seed.py --reset --with-reading` puts the demo back to its starting
# state and keeps web_cache (rehearsed answers replay free) and spend (budgets
# never reset). A paused VM runs nothing, so instead of a clock time the check is
# "is the last reseed older than RESEED_HOURS?", made every 30 s and right after a
# resume. It waits until nothing has been logged for RESEED_QUIET_SECONDS, so it
# doesn't cut off the visitor whose request just woke the VM. While it runs
# (a few seconds) the port is closed.
set -u

STATE=/var/lib/dialectic
BACKEND=/app/app/backend
DB=$BACKEND/dialectic.db
LOG=$STATE/uvicorn.log
STAMP=$STATE/last-reseed
PY=$BACKEND/.venv/bin/python

say() { echo "entrypoint: $*"; echo "$(date -u +%FT%TZ) entrypoint: $*" >> "$LOG"; }

if [ -f "$STATE/env" ]; then
  set -a; . "$STATE/env"; set +a
fi

# Defaults that fail closed: no budget set means no paid calls.
: "${PORT:=8080}"
: "${DO_INFERENCE_URL:=https://inference.do-ai.run/v1}"
: "${DO_MODEL:=anthropic-claude-sonnet-5.5}"
: "${AI_OFF:=0}"
: "${UPLOADS_ENABLED:=0}"
: "${DEVICE_ASKS_PER_HOUR:=5}"
: "${RESEED_HOURS:=24}"
: "${RESEED_QUIET_SECONDS:=300}"
[ -n "${AI_BUDGET_USD:-}" ] || { AI_BUDGET_USD=0; say "AI_BUDGET_USD not set: AI calls are blocked"; }
[ -n "${SEARCH_BUDGET_USD:-}" ] || { SEARCH_BUDGET_USD=0; say "SEARCH_BUDGET_USD not set: web search is blocked"; }
export PORT DO_INFERENCE_URL DO_MODEL AI_OFF UPLOADS_ENABLED DEVICE_ASKS_PER_HOUR AI_BUDGET_USD SEARCH_BUDGET_USD

pid=

start() {
  # guard.py wraps main:app and refuses what Caddy refused on the droplet.
  ( cd "$BACKEND" && PYTHONPATH=/app/deploy/microvm exec "$PY" -m uvicorn guard:app \
      --host 0.0.0.0 --port "$PORT" ) >> "$LOG" 2>&1 &
  pid=$!
  say "uvicorn started (pid $pid, port $PORT)"
}

stop() {
  [ -n "$pid" ] || return 0
  kill -TERM "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
  pid=
}

reseed() {
  if [ ! -f "$DB" ]; then
    say "first boot: starting from the prepared database"
    cp /app/seed.db "$DB"
  fi
  if ( cd "$BACKEND" && "$PY" seed.py --reset --with-reading ) >> "$LOG" 2>&1; then
    date +%s > "$STAMP"
    say "reseeded"
  else
    say "reseed FAILED (see above); will try again later"
  fi
}

trap 'say "stopping"; stop; exit 0' TERM INT

[ -f "$STAMP" ] || reseed
start

while :; do
  sleep 30
  if ! kill -0 "$pid" 2>/dev/null; then
    say "uvicorn exited; restarting"
    sleep 2
    start
    continue
  fi
  now=$(date +%s)
  last=$(cat "$STAMP" 2>/dev/null || echo 0)
  if [ $((now - last)) -ge $((RESEED_HOURS * 3600)) ]; then
    quiet=$((now - $(stat -c %Y "$LOG" 2>/dev/null || echo 0)))
    if [ "$quiet" -ge "$RESEED_QUIET_SECONDS" ]; then
      say "daily reseed (quiet for ${quiet} s)"
      stop
      [ -f "$LOG" ] && mv "$LOG" "$LOG.1"
      reseed
      start
    fi
  fi
done
