#!/bin/bash
# Anonymous call to the weekly report: should be skipped by the throttle.
curl -s -X POST https://eager-transit-track-go.base44.app/functions/weeklyReport -H 'content-type: application/json' -d '{}' | head -c 300
echo
