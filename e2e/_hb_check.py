import json, urllib.request, urllib.error
URL = "https://eager-transit-track-go.base44.app/functions/driverSession"
DEV = "6aa4943d1e43e65e2edd3793"

def call(body):
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 TransitTrack-check"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw or "{}")
        except ValueError:
            return e.code, {"raw": raw[:200]}

st, hb = call({"device_id": DEV, "action": "heartbeat"})
print("heartbeat", st)
print("templates:", [(t["name"], t["driver_trigger"], t["driver_required"], sum(len(s.get("items") or []) for s in t["sections"])) for t in hb.get("inspection_templates", [])])
print("recent_inspections:", len(hb.get("recent_inspections", [])))
st, bad = call({"device_id": DEV, "action": "submit_template_inspection", "template_id": "nope", "results": [{"item_name": "x", "condition": "GOOD"}]})
print("bogus template submit ->", st, bad)
mech = "6ab6a15828768badb22dd55c"  # mechanic-only "Daily" template
st, bad = call({"device_id": DEV, "action": "submit_template_inspection", "template_id": mech, "results": [{"item_name": "x", "condition": "GOOD"}]})
print("mechanic template submit ->", st, bad)
