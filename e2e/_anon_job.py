import json, urllib.request
L = "https://eager-transit-track-go.base44.app/functions/"
for job in ["weeklyReport", "maintenanceAlerts", "inspectionAlerts"]:
    if job != "weeklyReport":
        continue  # daily jobs haven't run yet today; an anonymous call would really send
    req = urllib.request.Request(L + job, data=b"{}", headers={"content-type": "application/json"}, method="POST")
    try:
        print(job, "->", urllib.request.urlopen(req, timeout=40).read().decode()[:200])
    except Exception as e:
        print(job, "-> error", getattr(e, "code", ""), getattr(e, "read", lambda: b"")().decode()[:200])
