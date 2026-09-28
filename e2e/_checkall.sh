#!/bin/bash
# Usage: bash e2e/_checkall.sh [base-url]  -> writes /tmp/checkall.log
B=${1:-http://localhost:4173}
if [[ "$B" == http://localhost* ]]; then
  curl -s localhost:4173 >/dev/null || (npx vite preview --port 4173 >/tmp/prev.log 2>&1 &)
  sleep 4
fi
{
node e2e/diagnose-authed.mjs $B admin "/admin,/manager,/vehicle-logs,/route-analytics,/incidents,/passenger-bookings,/service-history,/maintenance-queue"
node e2e/diagnose-authed.mjs $B user "/staff,/route-explorer,/staff-directory,/account"
node e2e/diagnose-authed.mjs $B mechanic "/mechanic,/run-inspection"
node e2e/diagnose-authed.mjs $B company "/company"
echo "== DONE"
} > /tmp/checkall.log 2>&1
