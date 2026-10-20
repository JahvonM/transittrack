import { describe, it, expect, afterEach, vi } from "vitest";
import { storedAccessToken, sessionHandoffToken, createBackend, AUTH_STORAGE_KEY } from "../../api/backend.supabase.js";
import { sessionRejected, httpStatus, errorData } from "../requestError.js";

// Step 7: the Supabase build's client (src/api/backend.supabase.js) must look
// like the Base44 client to the rest of the app.

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl";
const storage = (value) => ({ getItem: (k) => (k === AUTH_STORAGE_KEY ? value : null) });
const pageAt = (search, saved = null) => {
  globalThis.window = {
    location: { search, href: `https://app.example${search}`, origin: "https://app.example", pathname: "/" },
    localStorage: storage(saved),
    history: { state: null, replaceState() {} },
  };
};

afterEach(() => { delete globalThis.window; vi.unstubAllGlobals(); });

describe("Supabase client", () => {
  it("knows at once whether there is a sign-in to check", () => {
    pageAt("");
    expect(storedAccessToken()).toBeNull();
    pageAt("", JSON.stringify({ access_token: JWT, refresh_token: "r1" }));
    expect(storedAccessToken()).toBe(JWT);
    pageAt(`?access_token=${JWT}~refresh12345`);
    expect(storedAccessToken()).toBe("handoff");
    pageAt("?tt_oauth=1&code=abc");
    expect(storedAccessToken()).toBe("oauth-return");
    // Someone else's ?code= is not a sign-in, nor is a bare Base44-style token.
    pageAt("?code=abc");
    expect(storedAccessToken()).toBeNull();
    pageAt(`?access_token=${JWT}`);
    expect(storedAccessToken()).toBeNull();
    pageAt("?clear_access_token=true", JSON.stringify({ access_token: JWT, refresh_token: "r1" }));
    expect(storedAccessToken()).toBeNull();
  });

  it("hands the desktop/phone app the whole session, in a form their token checks accept", () => {
    const token = sessionHandoffToken(storage(JSON.stringify({ access_token: JWT, refresh_token: "Abc_123-xyz" })));
    expect(token).toBe(`${JWT}~Abc_123-xyz`);
    // The desktop app's and phone app's token checks (desktop/browser-signin.cjs, phoneSignIn.js).
    expect(/^[A-Za-z0-9._~+/=-]{20,8192}$/.test(token)).toBe(true);
    expect(sessionHandoffToken(storage(null))).toBeNull();
    expect(sessionHandoffToken(storage("not json"))).toBeNull();
    expect(sessionHandoffToken(storage(JSON.stringify({ access_token: JWT })))).toBeNull();
  });

  it("calls functions on Supabase and fails the way the app expects", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/myNotifications")) return new Response(JSON.stringify({ error: "Sign in required" }), { status: 401 });
      if (url.endsWith("/busy")) return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "retry-after": "3" } });
      return new Response(JSON.stringify({ result: { ok: true } }), { status: 200 });
    });
    const backend = createBackend();
    const ok = await backend.functions.invoke("appSupport", { action: "get" });
    expect(ok.data).toEqual({ result: { ok: true } });
    expect(calls[0].url).toBe("https://ghqpznxqngvhmkiwcauj.supabase.co/functions/v1/appSupport");
    expect(calls[0].init.headers.apikey).toMatch(/^sb_publishable_/);
    expect(calls[0].init.headers.Authorization).toBeUndefined(); // nobody signed in
    expect(JSON.parse(calls[0].init.body)).toEqual({ action: "get" });

    const denied = await backend.functions.invoke("myNotifications", {}).catch((e) => e);
    expect(httpStatus(denied)).toBe(401);
    expect(sessionRejected(denied)).toBe(true);
    expect(errorData(denied).error).toBe("Sign in required");
    expect(denied.message).toBe("Sign in required");

    const busy = await backend.functions.invoke("busy", {}).catch((e) => e);
    expect(busy.status).toBe(429);
    expect(busy.response.headers.get("retry-after")).toBe("3");

    await expect(backend.functions.invoke("../evil", {})).rejects.toMatchObject({ status: 400 });
  });

  it("uploads go through the integrations function as a form", async () => {
    let sent;
    vi.stubGlobal("fetch", async (url, init) => { sent = { url, init }; return new Response(JSON.stringify({ file_url: "https://x/signed" }), { status: 200 }); });
    const backend = createBackend();
    const file = new Blob(["abc"], { type: "image/png" });
    expect(await backend.integrations.Core.UploadPublicFile({ file })).toEqual({ file_url: "https://x/signed" });
    expect(sent.url).toMatch(/\/functions\/v1\/integrations$/);
    expect(sent.init.body.get("area")).toBe("public");
    expect(sent.init.headers["Content-Type"]).toBeUndefined(); // the browser sets the form boundary
    await expect(backend.integrations.Core.UploadPrivateFile({})).rejects.toMatchObject({ status: 400 });
  });
});
