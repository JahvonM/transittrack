#!/bin/bash
# Exercises the helper's HTTP side in simulate mode (run test_compile.py first).
pkill -f ttreader.exe 2>/dev/null; sleep 0.5
nohup mono /tmp/ttreader.exe > /tmp/ttreader.log 2>&1 &
sleep 2
LIVE=https://eager-transit-track-go.base44.app
H=http://127.0.0.1:8765
echo "== root";            curl -s $H/; echo
echo "== status allowed";  curl -s -i -H "Origin: $LIVE" $H/status | tr -d '\r' | grep -E "HTTP/|Access-Control|reader"
echo "== status evil";     curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.example" $H/status
echo "== preflight";       curl -s -i -X OPTIONS -H "Origin: $LIVE" -H "Access-Control-Request-Private-Network: true" $H/events | tr -d '\r' | grep -E "HTTP/|Private-Network|Allow-Origin"
echo "== events evil";     curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.example" $H/events
echo "== events stream (tap a simulated card while listening)"
( curl -s -N -H "Origin: $LIVE" $H/events > /tmp/sse.txt & echo $! > /tmp/sse.pid )
sleep 1
curl -s "$H/simulate?uid=04A28B226F1C80&type=MIFARE%20Classic%201K"; echo
curl -s "$H/feedback?kind=success&beep=1&led=1"; echo
curl -s "$H/feedback?kind=error"; echo
curl -s "$H/result?ok=1"; echo
curl -s "$H/feedback?kind=success&beep=0&led=0"; echo
sleep 1
kill $(cat /tmp/sse.pid) 2>/dev/null
echo "== SSE received:"; cat /tmp/sse.txt | grep -v "^$" | cut -c1-160
echo "== helper console:"; tail -12 /tmp/ttreader.log
