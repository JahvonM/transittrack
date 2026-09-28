#!/bin/bash
# Quick live smoke check: title, icons, manifest, crash-report + driver functions.
L=https://eager-transit-track-go.base44.app
echo "title: $(curl -s $L/ | grep -o '<title>[^<]*</title>')"
for p in /brand/icon.svg /brand/icon-192.png /manifest.webmanifest /maintenance-queue; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code} %{content_type}' $L$p)"
done
curl -s $L/manifest.webmanifest | head -c 120; echo
echo "reportClientError (no auth): $(curl -s -X POST $L/functions/reportClientError -H 'content-type: application/json' -d '{"message":"live smoke test","source":"smoke"}' | head -c 200)"
echo "driverSession bad device: $(curl -s -X POST $L/functions/driverSession -H 'content-type: application/json' -d '{"device_id":"nope","action":"heartbeat"}' | head -c 200)"
