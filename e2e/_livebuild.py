import re, urllib.request
L = "https://eager-transit-track-go.base44.app"
html = urllib.request.urlopen(L + "/").read().decode()
js = re.findall(r'/assets/index-[^"]+\.js', html)
css = re.findall(r'/assets/index-[^"]+\.css', html)
print("entry js:", js, "css:", css)
if js:
    src = urllib.request.urlopen(L + js[0]).read().decode()
    print("MapboxMapImpl chunk referenced:", "MapboxMapImpl" in src)
    print("mapbox css in entry css:", css and "mapboxgl-map" in urllib.request.urlopen(L + css[0]).read().decode())
