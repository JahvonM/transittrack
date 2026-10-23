import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { liveBackend } from "../../../vite.config.js";
import { forwarding, forwardToSupabase, SUPABASE_FUNCTIONS } from "../../../base44/shared/forwardToSupabase.ts";

// Step 7: one setting (base44/shared/liveBackend.ts) moves the whole app from
// Base44 to Supabase. The tablets, phone app and desktop app open the app
// Base44 hosts, so that build follows the setting, and the Base44 functions
// the installed tablet app posts to pass its calls on to Supabase.

const source = fs.readFileSync("base44/shared/liveBackend.ts", "utf8");

describe("the switch to Supabase", () => {
  it("is one line that the Base44 build reads", () => {
    expect(["base44", "supabase"]).toContain(liveBackend());
    expect(liveBackend(source.replace("LIVE_BACKEND: Backend = 'base44'", "LIVE_BACKEND: Backend = 'supabase'"))).toBe("supabase");
    expect(() => liveBackend("nothing here")).toThrow(/LIVE_BACKEND/);
  });

  it("never makes Supabase pass calls on to itself", () => {
    expect(fs.readFileSync("supabase/functions/_shared/liveBackend.ts", "utf8")).toMatch(/^export const RUNS_ON: Backend = 'supabase';$/m);
    expect(source).toMatch(/^export const RUNS_ON: Backend = 'base44';$/m);
    expect(forwarding("supabase", "base44")).toBe(true);
    expect(forwarding("supabase", "supabase")).toBe(false);
    expect(forwarding("base44", "base44")).toBe(false);
  });

  it("passes a tablet's call on unchanged, without a Base44 sign-in", async () => {
    let sent;
    const fetchImpl = async (url, init) => {
      sent = { url, init };
      return new Response(JSON.stringify({ ok: true }), { status: 429, headers: { "content-type": "application/json", "retry-after": "7", "set-cookie": "x=1" } });
    };
    const body = JSON.stringify({ device_id: "dev123", device_token: "a".repeat(64), action: "location" });
    const req = new Request("https://eager-transit-track-go.base44.app/api/apps/x/functions/driverSession", {
      method: "POST", body, headers: { "content-type": "application/json", authorization: "Bearer base44-token", "x-app-id": "x" },
    });
    const res = await forwardToSupabase(req, "driverSession", { live: "supabase", runsOn: "base44", fetchImpl });
    expect(sent.url).toBe(`${SUPABASE_FUNCTIONS}driverSession`);
    expect(new TextDecoder().decode(sent.init.body)).toBe(body);
    expect(sent.init.headers).toEqual({ apikey: expect.stringMatching(/^sb_publishable_/), "Content-Type": "application/json" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("7");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.json()).toEqual({ ok: true });
  });

  it("does nothing before the switch, and says busy if Supabase can't be reached", async () => {
    const req = () => new Request("https://x/f", { method: "POST", body: "{}" });
    expect(await forwardToSupabase(req(), "driverSession", { live: "base44", runsOn: "base44" })).toBeNull();
    const down = await forwardToSupabase(req(), "driverSession", { live: "supabase", runsOn: "base44", fetchImpl: async () => { throw new Error("offline"); } });
    expect(down.status).toBe(503);
    expect((await forwardToSupabase(req(), "../evil", { live: "supabase", runsOn: "base44" })).status).toBe(404);
  });

  it("Base44's scheduled jobs stand down after the switch, so no email goes out twice", () => {
    const jobs = new Set();
    for (const file of fs.readdirSync("base44/workflows")) {
      for (const m of fs.readFileSync(`base44/workflows/${file}`, "utf8").matchAll(/"function_name"\s*:\s*"([A-Za-z0-9_-]+)"|functions\/([A-Za-z0-9_-]+)/g)) jobs.add(m[1] || m[2]);
    }
    for (const name of ["inspectionAlerts", "maintenanceAlerts", "learnTravelTimes", "weeklyReport"]) jobs.add(name);
    for (const name of jobs) {
      const entry = fs.readFileSync(`base44/functions/${name}/entry.ts`, "utf8").replace(/\r\n?/g, "\n");
      expect(entry, name).toMatch(/export default async function \(req\) \{\n(?:  \/\/.*\n)*  if \(forwarding\(\)\) return Response\.json\(\{ skipped: 'Runs on Supabase now' \}\);/);
    }
    // The Supabase copies never stand down: there they are the real jobs.
    expect(forwarding("supabase", "supabase")).toBe(false);
    expect(forwarding("supabase", "base44")).toBe(true);
  });

  it("covers every function the installed tablet app posts to", () => {
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
    // Retain forwarding for the older installed tablets until all have upgraded.
    const forwarded = ["driverSession", "jobSigning", "kioskCheckIn", "kioskHeartbeat", "pairKioskDevice", "tabletControl", "tabletRecordings", "tabletSupport"];
    for (const name of native) expect(forwarded, `${name} is called by the tablet app`).toContain(name);
    for (const name of forwarded) {
      const entry = fs.readFileSync(`base44/functions/${name}/entry.ts`, "utf8").replace(/\r\n?/g, "\n");
      expect(entry, name).toMatch(new RegExp(`export default async function ?\\(req\\) ?\\{\\n.*\\n  const forwarded = await forwardToSupabase\\(req, '${name}'\\);\\n  if \\(forwarded\\) return forwarded;`));
    }
  });
});
