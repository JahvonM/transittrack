import { describe, it, expect, afterEach, vi } from "vitest";
import { storedAccessToken, sessionHandoffToken, sessionSubject, createBackend, linkLanding, AUTH_STORAGE_KEY } from "../../api/backend.supabase.js";
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

  it("says whose saved sign-in this is, but not while a new one is arriving", () => {
    const session = JSON.stringify({ access_token: JWT, refresh_token: "r1", user: { id: "auth-1" } });
    pageAt("", session);
    expect(sessionSubject()).toBe("sb:auth-1");
    pageAt("", JSON.stringify({ access_token: JWT, user: { id: "auth-1" } }));
    expect(sessionSubject()).toBeNull(); // no refresh token: not a usable sign-in
    pageAt(`?access_token=${JWT}~refresh12345`, session);
    expect(sessionSubject()).toBeNull(); // a hand-over is replacing it
    pageAt("?tt_oauth=1&code=abc", session);
    expect(sessionSubject()).toBeNull();
    pageAt("");
    expect(sessionSubject()).toBeNull();
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

  it("password reset and invite links are only used when the new password is saved", async () => {
    const calls = [];
    let verify = 200;
    let update = [422, 200];
    vi.stubGlobal("fetch", async (url, init = {}) => {
      const u = new URL(url);
      calls.push({ path: u.pathname, query: u.search, method: init.method, body: init.body ? JSON.parse(init.body) : null });
      const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (u.pathname === "/auth/v1/recover") return json(200, {});
      if (u.pathname === "/auth/v1/verify") {
        if (verify !== 200) return json(verify, { code: verify, error_code: "otp_expired", msg: "Email link is invalid or has expired" });
        return json(200, {
          access_token: "aaa.bbb.ccc", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "refresh-1", user: { id: "u1", aud: "authenticated", email: "a@b.co", app_metadata: {}, user_metadata: {} },
        });
      }
      if (u.pathname === "/auth/v1/user") {
        const status = update.shift() ?? 200;
        return status === 200
          ? json(200, { id: "u1", aud: "authenticated", email: "a@b.co", app_metadata: {}, user_metadata: {} })
          : json(status, { code: status, error_code: "weak_password", msg: "Password should be at least 6 characters." });
      }
      if (u.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
      return json(404, {});
    });

    pageAt("");
    const backend = createBackend();
    await backend.auth.resetPasswordRequest(" a@b.co ");
    const recover = calls.find((c) => c.path === "/auth/v1/recover");
    expect(recover.body.email).toBe("a@b.co");
    // Not tied to this browser: no PKCE challenge, so the link opens anywhere.
    expect(recover.body.code_challenge ?? null).toBeNull();
    // The email template adds /reset-password?token=...; the site is all it needs.
    expect(new URLSearchParams(recover.query).get("redirect_to")).toBe("https://app.example");

    // An invitation: the first password is too short, the second try works
    // without spending the link again.
    pageAt("?token=pkce_invite1&type=invite");
    calls.length = 0;
    await expect(backend.auth.resetPassword({ resetToken: "pkce_invite1", newPassword: "x" })).rejects.toBeTruthy();
    await backend.auth.resetPassword({ resetToken: "pkce_invite1", newPassword: "long enough" });
    const verifies = calls.filter((c) => c.path === "/auth/v1/verify");
    expect(verifies).toHaveLength(1);
    expect(verifies[0].body).toMatchObject({ token_hash: "pkce_invite1", type: "invite" });
    expect(calls.filter((c) => c.path === "/auth/v1/user").map((c) => c.body.password)).toEqual(["x", "long enough"]);

    // A used or old reset link says so in words that fit a link.
    pageAt("?token=pkce_old&type=recovery");
    verify = 403;
    const used = await backend.auth.resetPassword({ resetToken: "pkce_old", newPassword: "long enough" }).catch((e) => e);
    expect(calls.filter((c) => c.path === "/auth/v1/verify").at(-1).body).toMatchObject({ token_hash: "pkce_old", type: "recovery" });
    expect(used.message).toBe("This link has expired or was already used. Ask for a new one.");
    expect(errorData(used).code).toBe("otp_expired");
  });

  it("a reset or invite link from Supabase's standard email opens the new-password page", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl";
    expect(linkLanding(`#access_token=${jwt}&expires_in=3600&refresh_token=abcdefgh12&token_type=bearer&type=recovery`))
      .toEqual({ access_token: jwt, refresh_token: "abcdefgh12", next: "/reset-password?token=session" });
    expect(linkLanding(`#access_token=${jwt}&refresh_token=abcdefgh12&type=invite`).next).toBe("/reset-password?token=session&type=invite");
    // Anything else in the address is left alone.
    expect(linkLanding(`#access_token=${jwt}&refresh_token=abcdefgh12&type=signup`)).toBeNull();
    expect(linkLanding("#access_token=nope&refresh_token=abcdefgh12&type=recovery")).toBeNull();
    expect(linkLanding("#error=access_denied&error_code=otp_expired")).toBeNull();
    expect(linkLanding("")).toBeNull();
    globalThis.window = { location: { search: "", hash: `#access_token=${jwt}&refresh_token=abcdefgh12&type=recovery` }, localStorage: storage(null) };
    expect(storedAccessToken()).toBe("email-link");
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
