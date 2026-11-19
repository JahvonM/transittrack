// The parts kiosk (/parts) is an app of its own: "Add to Home Screen" while
// it is open should make a "Parts" icon that opens /parts, not the main app.
// While the page is open its manifest, Home Screen name and title replace the
// main app's; leaving the page puts them back.
export function swapHomeScreenApp(doc, { manifest, title } = {}) {
  if (!doc?.head) return () => {};
  const link = doc.querySelector('link[rel="manifest"]');
  let meta = doc.querySelector('meta[name="apple-mobile-web-app-title"]');
  const before = { href: link?.getAttribute("href") ?? null, name: meta?.getAttribute("content") ?? null, hadMeta: !!meta, title: doc.title };
  if (link && manifest) link.setAttribute("href", manifest);
  if (title) {
    if (!meta) {
      meta = doc.createElement("meta");
      meta.setAttribute("name", "apple-mobile-web-app-title");
      doc.head.appendChild(meta);
    }
    meta.setAttribute("content", title);
    doc.title = `${title} · McSween Transport`;
  }
  return () => {
    if (link && before.href != null) link.setAttribute("href", before.href);
    if (meta) {
      if (before.hadMeta) meta.setAttribute("content", before.name ?? "");
      else meta.remove?.();
    }
    doc.title = before.title;
  };
}
