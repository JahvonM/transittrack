import { describe, it, expect } from "vitest";
import fs from "node:fs";

// The app runs on Supabase only. The browser build and the installed tablet
// app both talk to it directly; nothing goes through Base44 any more.
describe("the app talks to Supabase", () => {
  it("builds every web version on the Supabase client", () => {
    const config = fs.readFileSync("vite.config.js", "utf8");
    expect(config).toContain("'tt-backend': fileURLToPath(new URL('./src/api/backend.supabase.js', import.meta.url))");
    expect(config).not.toMatch(/@base44\//);
    expect(fs.existsSync("src/api/backend.base44.js")).toBe(false);
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((name) => name.startsWith("@base44/"))).toEqual([]);
  });

  it("the installed tablet app calls only its four Supabase functions, and opens the Supabase site", () => {
    const native = new Set();
    for (const dir of ["android/app/src/main/java/com/transittrack/app"]) {
      for (const file of fs.readdirSync(dir)) {
        for (const m of fs.readFileSync(`${dir}/${file}`, "utf8").matchAll(/https:\/\/([^/"\s]+)\/functions\/v1\/([A-Za-z0-9_-]+)/g)) {
          expect(m[1]).toBe("ghqpznxqngvhmkiwcauj.supabase.co");
          native.add(m[2]);
        }
      }
    }
    expect([...native].sort()).toEqual(["driverSession", "tabletControl", "tabletRecordings", "tabletSupport"]);
    const cap = JSON.parse(fs.readFileSync("capacitor.config.json", "utf8"));
    expect(cap.server.url).toBe("https://app.mcsweenstransport.com");
    expect(cap.server.allowNavigation).toEqual(["app.mcsweenstransport.com"]);
  });

  it("no function passes calls on, and no scheduled job stands down", () => {
    for (const name of fs.readdirSync("base44/functions")) {
      const file = `base44/functions/${name}/entry.ts`;
      if (!fs.existsSync(file)) continue;
      const entry = fs.readFileSync(file, "utf8");
      expect(entry, name).not.toMatch(/forwardToSupabase|forwarding\(\)|liveBackend/);
    }
  });
});
