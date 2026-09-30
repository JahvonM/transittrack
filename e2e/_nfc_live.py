import json, urllib.request, urllib.error
base = "https://eager-transit-track-go.base44.app"
def post(body):
    req = urllib.request.Request(base + "/functions/nfcCards", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 check"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, r.read().decode()[:200]
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:200]
print("anonymous people ->", post({"action": "people"}))
print("anonymous issue  ->", post({"action": "issue", "uid": "04A28B22", "person_key": "driver:x"}))
with urllib.request.urlopen(urllib.request.Request(base + "/tools/TransitTrack-Card-Reader.bat", headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as r:
    data = r.read()
    print("helper download ->", r.status, r.headers.get("content-type"), len(data), "bytes, starts:", data[:30])
