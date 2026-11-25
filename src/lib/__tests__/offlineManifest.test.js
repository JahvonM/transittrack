import { describe, expect, it } from "vitest";
import { offlineFiles } from "../../../vite.config.js";

// The list of files devices save for offline use is made from the finished
// build: only files that are really there, never maps, the page or the list itself.
describe("offline file list", () => {
  it("lists only built files that exist", () => {
    const bundle = { "index.html": {}, "offline-manifest.json": {}, "assets/index-A.js": {}, "assets/index-A.js.map": {}, "assets/mapbox-gl-OLDNAME.js": {}, "assets/mapbox-gl-REAL.js": {}, "assets/app.css": {} };
    const onDisk = new Set(["dist/assets/index-A.js", "dist/assets/mapbox-gl-REAL.js", "dist/assets/app.css"]);
    expect(offlineFiles(bundle, "dist", (p) => onDisk.has(p))).toEqual(["assets/index-A.js", "assets/mapbox-gl-REAL.js", "assets/app.css"]);
  });
});
