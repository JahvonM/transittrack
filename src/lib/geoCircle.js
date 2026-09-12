// Builds a real geographic circle (as a GeoJSON polygon ring) around a point,
// so accuracy halos represent true ground distance and scale correctly with
// zoom — a plain Mapbox "circle" layer's radius is in screen pixels, not
// meters, so it doesn't actually reflect real-world GPS accuracy.
export function circlePolygonCoords(lat, lng, radiusMeters, points = 48) {
  const coords = [];
  const earthRadius = 6371000;
  const latRad = (lat * Math.PI) / 180;

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    const dLat = dy / earthRadius;
    const dLng = dx / (earthRadius * Math.cos(latRad));
    coords.push([lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI]);
  }
  return coords;
}

export function accuracyCircleGeoJSON(lat, lng, radiusMeters) {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [circlePolygonCoords(lat, lng, radiusMeters)] },
  };
}
