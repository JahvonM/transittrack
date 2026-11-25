import { describe, it, expect, vi } from "vitest";
import { addressWithCode, keepHomeScreenCode, manifestWithCode, readHomeScreenCode, wantsHomeScreenCode } from "../homeScreenSignIn.js";

const CODE = "a".repeat(64);
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

function fakeWin({ ua = IPHONE, standalone = false, href = "https://app.example/journey?x=1" } = {}) {
  const link = { href: "/manifest.webmanifest", getAttribute() { return this.href; }, setAttribute(_k, v) { this.href = v; } };
  const win = {
    navigator: { userAgent: ua, standalone, maxTouchPoints: 5 },
    matchMedia: () => ({ matches: false }),
    location: new URL(href),
    history: { state: null, replaceState(_s, _t, url) { win.location = new URL(url, win.location.origin); } },
    document: { querySelector: () => link },
    fetch: async () => ({ json: async () => ({ name: "McSween Transport", start_url: "/" }) }),
    Blob: class { constructor(parts) { this.text = parts.join(""); } },
    URL: { createObjectURL: (b) => { win.made = JSON.parse(b.text); return "blob:manifest"; }, revokeObjectURL() {} },
    setTimeout: () => 1, clearTimeout() {},
  };
  return { win, link };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("the Home Screen app's one-time code", () => {
  it("reads the code from the address and gives the address without it", () => {
    expect(readHomeScreenCode(new URL(`https://app.example/?hs=${CODE}#x`))).toEqual({ code: CODE, clean: "/#x" });
    expect(readHomeScreenCode(new URL("https://app.example/journey?hs=nope&y=2"))).toEqual({ code: "", clean: "/journey?y=2" });
    expect(readHomeScreenCode(new URL("https://app.example/"))).toBeNull();
    expect(addressWithCode(new URL(`https://app.example/more?hs=${"b".repeat(64)}`), CODE)).toBe(`/more?hs=${CODE}`);
  });

  it("opens the Home Screen app at the start with the code", () => {
    expect(manifestWithCode({ name: "M", start_url: "/" }, "https://app.example", CODE)).toEqual({ name: "M", id: "/", start_url: `https://app.example/?hs=${CODE}` });
  });

  it("is only for passengers in Safari on an iPhone or iPad", () => {
    expect(wantsHomeScreenCode(fakeWin().win, "staff")).toBe(true);
    expect(wantsHomeScreenCode(fakeWin().win, "admin")).toBe(false);
    expect(wantsHomeScreenCode(fakeWin({ standalone: true }).win, "staff")).toBe(false);
    expect(wantsHomeScreenCode(fakeWin({ ua: "Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile Safari/537.36" }).win, "staff")).toBe(false);
  });

  it("puts the code in the address and the manifest, and takes it out again", async () => {
    const { win, link } = fakeWin();
    const issue = vi.fn(async () => ({ code: CODE }));
    const stop = keepHomeScreenCode({ win, issue, role: "staff", userId: "u1" });
    await flush(); await flush();
    expect(win.location.pathname + win.location.search).toBe(`/journey?x=1&hs=${CODE}`);
    expect(link.href).toBe("blob:manifest");
    expect(win.made.start_url).toBe(`https://app.example/?hs=${CODE}`);
    stop();
    expect(win.location.pathname + win.location.search).toBe("/journey?x=1");
    expect(link.href).toBe("/manifest.webmanifest");
  });

  it("reuses a recent code across screens, but never another person's", async () => {
    const issue = vi.fn(async () => ({ code: CODE }));
    keepHomeScreenCode({ win: fakeWin().win, issue, role: "staff", userId: "u2" })();
    await flush();
    keepHomeScreenCode({ win: fakeWin().win, issue, role: "staff", userId: "u2" });
    await flush();
    expect(issue).toHaveBeenCalledTimes(1);
    const other = vi.fn(async () => ({ code: "c".repeat(64) }));
    keepHomeScreenCode({ win: fakeWin().win, issue: other, role: "staff", userId: "u3" });
    await flush();
    expect(other).toHaveBeenCalledTimes(1);
  });
});
