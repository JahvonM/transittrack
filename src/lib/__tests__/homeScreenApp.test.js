import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { swapHomeScreenApp } from "../homeScreenApp.js";

const root = path.resolve(__dirname, "../../..");

// Just enough of a document for the swap.
function fakeDoc({ meta = true } = {}) {
  const el = (attrs) => ({
    attrs: { ...attrs },
    getAttribute(k) { return this.attrs[k] ?? null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    remove() { doc.head.children = doc.head.children.filter((c) => c !== this); },
  });
  const doc = {
    title: "McSween Transport",
    head: { children: [el({ rel: "manifest", href: "/manifest.webmanifest?v=mcsween1" })], appendChild(c) { this.children.push(c); } },
    createElement: () => el({}),
    querySelector(sel) {
      if (sel === 'link[rel="manifest"]') return this.head.children.find((c) => c.attrs.rel === "manifest") || null;
      if (sel === 'meta[name="apple-mobile-web-app-title"]') return this.head.children.find((c) => c.attrs.name === "apple-mobile-web-app-title") || null;
      return null;
    },
  };
  if (meta) doc.head.children.push(el({ name: "apple-mobile-web-app-title", content: "McSween" }));
  return doc;
}

describe("the parts kiosk as its own Home Screen app", () => {
  it("swaps the manifest, name and title while open, and puts them back", () => {
    const doc = fakeDoc();
    const restore = swapHomeScreenApp(doc, { manifest: "/parts.webmanifest?v=parts1", title: "Parts" });
    expect(doc.querySelector('link[rel="manifest"]').getAttribute("href")).toBe("/parts.webmanifest?v=parts1");
    expect(doc.querySelector('meta[name="apple-mobile-web-app-title"]').getAttribute("content")).toBe("Parts");
    expect(doc.title).toBe("Parts · McSween Transport");
    restore();
    expect(doc.querySelector('link[rel="manifest"]').getAttribute("href")).toBe("/manifest.webmanifest?v=mcsween1");
    expect(doc.querySelector('meta[name="apple-mobile-web-app-title"]').getAttribute("content")).toBe("McSween");
    expect(doc.title).toBe("McSween Transport");
  });

  it("adds the Home Screen name when the page has none, and removes it again", () => {
    const doc = fakeDoc({ meta: false });
    const restore = swapHomeScreenApp(doc, { manifest: "/parts.webmanifest", title: "Parts" });
    expect(doc.querySelector('meta[name="apple-mobile-web-app-title"]').getAttribute("content")).toBe("Parts");
    restore();
    expect(doc.querySelector('meta[name="apple-mobile-web-app-title"]')).toBeNull();
  });

  it.each([["parts", "Parts"], ["workshop", "Workshop"]])("has a manifest that opens /%s, with the main app's icons and colours", (name, shortName) => {
    const main = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.webmanifest"), "utf8"));
    const app = JSON.parse(fs.readFileSync(path.join(root, `public/${name}.webmanifest`), "utf8"));
    expect(app).toMatchObject({ id: `/${name}`, start_url: `/${name}`, scope: "/", short_name: shortName, display: "standalone" });
    expect(app.icons).toEqual(main.icons);
    expect([app.background_color, app.theme_color]).toEqual([main.background_color, main.theme_color]);
    // The rest of the app keeps the main manifest.
    expect(fs.readFileSync(path.join(root, "index.html"), "utf8")).toContain('<link rel="manifest" href="/manifest.webmanifest');
  });
});
