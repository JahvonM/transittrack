import re, urllib.request, urllib.error
src = open("src/lib/mapbox.js").read()
tok = re.search(r'"(pk\.[^"]+)"', src).group(1)
urls = {
    "style streets": f"https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token={tok}",
    "style dark": f"https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token={tok}",
    "vector tile": f"https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/12/1194/1906.vector.pbf?access_token={tok}",
}
referers = {
    "live site": "https://eager-transit-track-go.base44.app/",
    "no referer": None,
    "other site": "https://example.com/",
}
for name, u in urls.items():
    for rn, ref in referers.items():
        h = {"User-Agent": "Mozilla/5.0"}
        if ref:
            h["Referer"] = ref
            h["Origin"] = ref.rstrip("/")
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=h), timeout=20) as r:
                print(f"{name:14} | {rn:10} | {r.status}")
        except urllib.error.HTTPError as e:
            print(f"{name:14} | {rn:10} | {e.code} {e.read()[:120]!r}")
        except Exception as e:
            print(f"{name:14} | {rn:10} | ERR {e}")
