import json, urllib.request, urllib.error
base = "https://eager-transit-track-go.base44.app/functions/kioskCheckIn"
BUS = "6ab1c20ad1950a63df4289f4"  # the live bus boarding tablet ("Bus 12")
def post(body):
    req = urllib.request.Request(base, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 check"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, r.read().decode()[:160]
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:160]
print("register_badge from a tablet  ->", post({"device_id": BUS, "action": "register_badge", "staff_id": "x", "card_tag": "04DEADBEEF01"}))
print("keypad code from a tablet     ->", post({"device_id": BUS, "action": "generate_access_code", "staff_id": "x"}))
print("keypad code, no login         ->", post({"action": "generate_access_code", "staff_id": "x", "company_id": "c"}))
print("bus boarding lookup still ok  ->", post({"device_id": BUS, "action": "lookup_code", "code": "00000"}))
