// Reapplied after every Mapbox style swap. Optional features degrade to the base map.
export function applyMapPerspective(map, enabled, dark = false) {
  try {
    if (!map?.isStyleLoaded?.()) return;
    if (enabled && !map.getSource("tt-terrain")) map.addSource("tt-terrain", {type:"raster-dem",url:"mapbox://mapbox.mapbox-terrain-dem-v1",tileSize:512,maxzoom:14});
    map.setTerrain(enabled ? {source:"tt-terrain",exaggeration:1.15} : null);
    if (enabled && map.getSource("composite") && !map.getLayer("tt-buildings")) {
      const before = map.getStyle().layers.find(l => l.type === "symbol" && l.layout?.["text-field"])?.id;
      map.addLayer({id:"tt-buildings",source:"composite","source-layer":"building",filter:["==","extrude","true"],type:"fill-extrusion",minzoom:14,paint:{"fill-extrusion-color": dark ? "#344852" : "#d3dfde","fill-extrusion-height":["coalesce",["get","height"],0],"fill-extrusion-base":["coalesce",["get","min_height"],0],"fill-extrusion-opacity":0.85}},before);
    }
    if (map.getLayer("tt-buildings")) map.setLayoutProperty("tt-buildings","visibility", enabled ? "visible" : "none");
  } catch { /* Missing terrain/building data must never prevent live tracking. */ }
}
