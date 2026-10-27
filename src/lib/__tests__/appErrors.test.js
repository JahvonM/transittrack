import { describe, it, expect } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";
import { addBreadcrumb, appArea, breadcrumbs, safePath } from "@/lib/breadcrumbs";
import { greetingName } from "@/lib/userName";
import { describeDevice, errorHint } from "@/lib/appErrorText";

const call = async (sdk, name, body) => { const r = await load(name, sdk).default(request(body)); return { status: r.status, body: await r.json() }; };

describe("what an error report carries", () => {
  it("keeps page names but never the values in a link", () => {
    expect(safePath("/kiosk", "?code=ABC123SECRET&mode=x")).toBe("/kiosk?code&mode");
    expect(safePath("/admin/fleet", "")).toBe("/admin/fleet");
  });
  it("names the part of the app", () => {
    expect(appArea("/admin/faults")).toBe("Admin");
    expect(appArea("/driver-phone/me")).toBe("Driver phone app");
    expect(appArea("/driver")).toBe("Driver tablet");
    expect(appArea("/kiosk")).toBe("Boarding tablet");
    expect(appArea("/home")).toBe("Passenger app");
  });
  it("remembers only the last 25 steps", () => {
    for (let i = 0; i < 40; i++) addBreadcrumb("tap", `Button ${i}`);
    const trail = breadcrumbs();
    expect(trail).toHaveLength(25);
    expect(trail.at(-1).text).toBe("Button 39");
  });
});

describe("reportClientError stores the steps safely", () => {
  it("saves cleaned steps, context and area, and strips codes from the page address", async () => {
    const sdk = mock(null);
    sdk.tables.ClientError = [];
    const res = await call(sdk, "reportClientError", {
      message: "Cannot read properties of undefined (reading 'name')",
      url: "/kiosk?code=PAIR12345678",
      context: { area: "Boarding tablet", version: "index-abc", screen: "1280x800", online: true, installed: true, language: "en", extra: "dropped" },
      breadcrumbs: [
        { t: "2026-10-09T10:00:00Z", type: "page", text: "/kiosk" },
        { t: "2026-10-09T10:00:05Z", type: "tap", text: "<b>Board</b>" },
        { t: "nonsense", type: "evil", text: "x".repeat(500) },
      ],
    });
    expect(res.status).toBe(200);
    const row = sdk.tables.ClientError[0];
    expect(row.url).toBe("/kiosk?code");
    expect(row.area).toBe("Boarding tablet");
    expect(row.status).toBe("new");
    expect(row.context).toEqual({ version: "index-abc", screen: "1280x800", online: true, installed: true, language: "en" });
    expect(row.breadcrumbs[1]).toEqual({ t: "2026-10-09T10:00:05.000Z", type: "tap", text: "bBoard/b" });
    expect(row.breadcrumbs[2]).toMatchObject({ t: "", type: "other" });
    expect(row.breadcrumbs[2].text.length).toBe(160);
  });
  it("ignores an unknown app area", async () => {
    const sdk = mock(null);
    sdk.tables.ClientError = [];
    await call(sdk, "reportClientError", { message: "x", context: { area: "Hacker land" } });
    expect(sdk.tables.ClientError[0].area).toBe("");
  });
});

describe("what the alert email says happened", () => {
  const report = async (body) => {
    const sdk = mock(null);
    sdk.tables.ClientError = [];
    sdk.tables.User = [{ id: "boss", role: "admin", email: "boss@test.invalid" }];
    const res = await call(sdk, "reportClientError", body);
    return { sdk, res };
  };
  it("ignores Microsoft's link checker, which isn't a person or our code", async () => {
    const { sdk, res } = await report({ message: "Object Not Found Matching Id:2, MethodName:update, ParamCount:4", source: "promise" });
    expect(res.body).toMatchObject({ ok: true, ignored: true });
    expect(sdk.tables.ClientError).toHaveLength(0);
    expect(sdk.emails).toHaveLength(0);
  });
  it("says a screen crashed only when the person saw the error screen", async () => {
    const crash = await report({ message: "Cannot read properties of undefined (reading 'x')", source: "boundary" });
    expect(crash.sdk.emails[0].subject).toMatch(/^McSween Transport crash alert: /);
    expect(crash.sdk.emails[0].body).toMatch(/saw a "Something went wrong" screen/);
    const background = await report({ message: "Background thing failed", source: "promise" });
    expect(background.sdk.emails[0].subject).toMatch(/^McSween Transport error report: /);
    expect(background.sdk.emails[0].body).toMatch(/kept working; this happened in the background/);
    expect(background.sdk.emails[0].body).not.toMatch(/Something went wrong/);
    const style = await report({ message: "Unable to preload CSS for /assets/SiteApp-x.css", source: "style" });
    expect(style.sdk.emails[0].body).toMatch(/opened without some of its look/);
  });
});

describe("marking errors fixed", () => {
  const setup = (role) => {
    const sdk = mock(role);
    sdk.tables.ClientError = [{ id: "e1", message: "Boom", status: "new" }];
    return sdk;
  };
  it("admins can mark an error fixed and reopen it, nothing else", async () => {
    const sdk = setup("admin");
    const fixed = await call(sdk, "entityAccess", { entity: "ClientError", operation: "update", id: "e1", data: { status: "resolved" } });
    expect(fixed.status).toBe(200);
    expect(sdk.tables.ClientError[0]).toMatchObject({ status: "resolved", resolved_by: "Caller" });
    expect(sdk.tables.ClientError[0].resolved_at).toBeTruthy();
    expect((await call(sdk, "entityAccess", { entity: "ClientError", operation: "update", id: "e1", data: { message: "Changed" } })).status).toBe(403);
    expect((await call(sdk, "entityAccess", { entity: "ClientError", operation: "update", id: "e1", data: { status: "deleted" } })).status).toBe(403);
    expect((await call(sdk, "entityAccess", { entity: "ClientError", operation: "create", data: { message: "Fake" } })).status).toBe(403);
    await call(sdk, "entityAccess", { entity: "ClientError", operation: "update", id: "e1", data: { status: "new" } });
    expect(sdk.tables.ClientError[0]).toMatchObject({ status: "new", resolved_by: "", resolved_at: null });
  });
  it("nobody else can see or change errors", async () => {
    for (const role of ["company", "mechanic", "staff"]) {
      const sdk = setup(role);
      expect((await call(sdk, "entityAccess", { entity: "ClientError", operation: "update", id: "e1", data: { status: "resolved" } })).status).toBe(404);
      expect((await call(sdk, "entityAccess", { entity: "ClientError", operation: "list" })).body.result).toEqual([]);
    }
  });
});

describe("plain-English help on the admin page", () => {
  it("describes devices", () => {
    expect(describeDevice("Mozilla/5.0 (Linux; Android 13; SM-T220) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36")).toBe("Android tablet · Chrome");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129 Mobile Safari/537.36".replace("13; wv)", "13; Pixel; wv)"))).toBe("Android phone · inside the McSween Transport app");
  });
  it("explains common errors", () => {
    expect(errorHint("Failed to fetch dynamically imported module: /assets/x.js")).toMatch(/updated while this person had it open/);
    expect(errorHint("Network Error")).toMatch(/lost its connection/);
    expect(errorHint("Cannot read properties of null (reading 'id')")).toMatch(/needs a fix/);
  });
});

describe("passenger welcome", () => {
  it("uses the name the passenger set, exactly as set, before their Google name", () => {
    expect(greetingName({ display_name: "Jay M", full_name: "Jahvon Modeste" })).toBe("Jay M");
    expect(greetingName({ display_name: "  ", full_name: "Jahvon Modeste" })).toBe("Jahvon");
    expect(greetingName({ email: "someone@gmail.com" })).toBe("");
  });
});
