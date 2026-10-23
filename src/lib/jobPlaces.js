// Shared dispatch ordering: favourite saved locations first, then by name.
export function orderedJobPlaces(places = []) {
  return [...places].sort((a, b) =>
    Number(!!b.favorite) - Number(!!a.favorite) ||
    String(a.name || "").localeCompare(String(b.name || ""))
  );
}
