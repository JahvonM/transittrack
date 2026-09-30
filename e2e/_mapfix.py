p = 'src/components/MapboxMapImpl.jsx'
s = open(p).read()
a = '''  pins = [],
}) {'''
assert a in s
s = s.replace(a, '''  pins = [],
  // Called if the map engine can't start on this device (no WebGL), so the
  // wrapper can swap in the basic map.
  onEngineFail,
}) {''', 1)
b = '''        onLoad={(e) => { setMapLoaded(true); declutterStyle(e.target); }}'''
assert b in s
s = s.replace(b, b + '''
        onError={(e) => { if (/webgl/i.test(e?.error?.message || "")) onEngineFail?.(); }}''', 1)
open(p, 'w').write(s)

p = 'src/components/driver/DriverNavMap.jsx'
s = open(p).read()
old = '''    if (!map || !target) return;
    following.current = true;
    setIsFollowing(true);
    map.flyTo('''
assert old in s
s = s.replace(old, '''    if (!target) return;
    following.current = true;
    setIsFollowing(true);
    if (!map) return; // the basic map follows by itself once isFollowing is on
    map.flyTo(''', 1)

# Basic-map branch for devices without WebGL 2.
s = s.replace('''import Map, { Marker, Source, Layer } from "react-map-gl";''', '''import Map, { Marker, Source, Layer } from "react-map-gl";
import LiteMap from "@/components/LiteMap";
import { mapEngine, markFullMapFailed } from "@/lib/mapEngine";''', 1)
anchor = '''  const mapRef = useRef(null);
'''
assert anchor in s
s = s.replace(anchor, anchor + '''  const [basicMap, setBasicMap] = useState(() => mapEngine() === "basic");
''', 1)
old_open = '''        <Map
          ref={mapRef} mapboxAccessToken={MAPBOX_TOKEN} mapStyle={mapStyleFor(isDark)}'''
assert old_open in s
i = s.index(old_open)
j = s.index('        </Map>\n', i) + len('        </Map>\n')
full = s[i:j]
full = full.replace('''          onLoad={(e) => hidePoiLayers(e.target)}''', '''          onLoad={(e) => hidePoiLayers(e.target)}
          onError={(e) => { if (/webgl/i.test(e?.error?.message || "")) { markFullMapFailed(); setBasicMap(true); } }}''', 1)
lite = '''        {basicMap ? (
          <LiteMap
            fill
            followUser={isFollowing}
            showUserDot={false}
            showRecenter={false}
            onDragStart={() => { following.current = false; setIsFollowing(false); }}
            userLocation={smoothPos || (vehicle?.current_lat != null ? { lat: vehicle.current_lat, lng: vehicle.current_lng } : null)}
            vehicles={smoothPos || vehicle?.current_lat != null ? [{
              id: "self", name: vehicle?.name, marker_label: "",
              current_lat: smoothPos?.lat ?? vehicle.current_lat, current_lng: smoothPos?.lng ?? vehicle.current_lng,
              marker_color: accent, marker_size: 40, marker_heading: heading ?? null,
            }] : []}
            stops={nextStop ? [{ ...nextStop, color: "#10b981" }] : []}
            lines={[
              { coords: trail.filter((p) => p.lat != null && p.lng != null).map((p) => [p.lng, p.lat]), color: accent, width: 4, opacity: 0.5 },
              { coords: navRoute?.geometry || [], color: accent, width: 5, opacity: 0.85 },
            ]}
          />
        ) : (
''' + '\n'.join('  ' + ln if ln else ln for ln in full.rstrip('\n').split('\n')) + '''
        )}
'''
s = s[:i] + lite + s[j:]
open(p, 'w').write(s)
print("ok")
