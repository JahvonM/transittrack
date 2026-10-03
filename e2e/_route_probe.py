import json, re, sys, urllib.request

token = re.search(r"pk\.[A-Za-z0-9._-]+", open("src/lib/mapbox.js").read()).group(0)
a, b = sys.argv[1], sys.argv[2]
url = ("https://api.mapbox.com/directions/v5/mapbox/driving-traffic/%s;%s?geometries=geojson&overview=full&steps=true"
       "&annotations=maxspeed,congestion,distance,duration&banner_instructions=true&voice_instructions=true&voice_units=metric&access_token=%s") % (a, b, token)
d = json.load(urllib.request.urlopen(url))
json.dump(d, open(sys.argv[3] if len(sys.argv) > 3 else "/tmp/route.json", "w"))
print(d.get("code"), d.get("message"))
r = d["routes"][0]; leg = r["legs"][0]
print("dist", r["distance"], "dur", r["duration"], "coords", len(r["geometry"]["coordinates"]))
an = leg.get("annotation", {})
print({k: len(v) for k, v in an.items()}); print(an.get("maxspeed", [])[:3], an.get("congestion", [])[:5])
for s in leg["steps"][:5]:
    m = s["maneuver"]
    print("---", m.get("type"), m.get("modifier"), m.get("instruction"), "|", s["name"], round(s["distance"]))
    print(" banner", json.dumps(s.get("bannerInstructions", [])[:1])[:500])
    print(" voice", [(round(v["distanceAlongGeometry"]), v["announcement"]) for v in s.get("voiceInstructions", [])])
print(len(leg["steps"]), "steps; sum", round(sum(s["distance"] for s in leg["steps"])))
