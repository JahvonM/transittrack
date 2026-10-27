import { describe, it, expect, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
vi.mock("@/lib/phoneSignIn", () => ({ phoneSignInAvailable: vi.fn(() => false) }));
vi.mock("tt-backend", () => ({ BACKEND: "supabase" }));
const { googleButtonAvailable, makeNonce, signedInPath, GOOGLE_WEB_CLIENT_ID, GIS_ORIGINS } = await import("@/lib/googleButton");
const { phoneSignInAvailable } = await import("@/lib/phoneSignIn");

const win = (origin, ua = "Mozilla/5.0", extra = {}) => ({ location: { origin }, navigator: { userAgent: ua }, ...extra });

describe("Google's own sign-in button", () => {
  it("shows on the app's site in a normal browser only", () => {
    expect(googleButtonAvailable(win("https://app.mcsweenstransport.com"))).toBe(true);
    // Not an allowed origin in Google Cloud: keep the redirect.
    expect(googleButtonAvailable(win("https://new.mcsweenstransport.com"))).toBe(false);
    expect(googleButtonAvailable(win("http://localhost:4173"))).toBe(false);
    // Google refuses inside the desktop and phone apps; they open a browser first.
    expect(googleButtonAvailable(win("https://app.mcsweenstransport.com", "Electron/30"))).toBe(false);
    expect(googleButtonAvailable(win("https://app.mcsweenstransport.com", "x", { transittrackDesktop: {} }))).toBe(false);
    phoneSignInAvailable.mockReturnValueOnce(true);
    expect(googleButtonAvailable(win("https://app.mcsweenstransport.com"))).toBe(false);
    expect(googleButtonAvailable(null)).toBe(false);
  });

  it("uses the same public Google client as the redirect sign-in", () => {
    expect(GOOGLE_WEB_CLIENT_ID).toMatch(/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/);
    expect(GIS_ORIGINS).toEqual(["https://app.mcsweenstransport.com"]);
  });

  it("makes a fresh nonce whose hash goes to Google and plain value to Supabase", async () => {
    const a = await makeNonce(webcrypto), b = await makeNonce(webcrypto);
    expect(a.raw).toMatch(/^[a-f0-9]{64}$/);
    expect(a.raw).not.toBe(b.raw);
    expect(a.hashed).toBe(createHash("sha256").update(a.raw).digest("hex"));
  });

  it("only ever continues to a page on this site", () => {
    expect(signedInPath("/login?authReturn=1&returnTo=%2Fadmin")).toBe("/login?authReturn=1&returnTo=%2Fadmin");
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "", null]) expect(signedInPath(bad)).toBe("/");
  });
});
