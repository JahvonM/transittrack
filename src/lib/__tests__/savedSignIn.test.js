import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// "Trust the phone" (src/lib/savedSignIn.js): the saved profile is reused only
// for the same sign-in, only while it's recent, and forgotten on sign-out.
let subject = "sb:person-1";
vi.mock("tt-backend", () => ({ sessionSubject: () => subject }));
const { savedProfile, rememberProfile, forgetProfile, savedPublicSettings, rememberPublicSettings, SAVED_PROFILE_MAX_AGE_MS } = await import("../savedSignIn.js");

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

beforeEach(() => { subject = "sb:person-1"; vi.stubGlobal("window", { localStorage: memoryStorage() }); });
afterEach(() => vi.unstubAllGlobals());

describe("saved sign-in", () => {
  const person = { id: "u1", role: "passenger", full_name: "Kim" };

  it("gives back the profile for the same sign-in", () => {
    rememberProfile(person, 1000);
    expect(savedProfile(2000)).toEqual(person);
  });

  it("never shows one person's profile under another person's sign-in", () => {
    rememberProfile(person, 1000);
    subject = "sb:person-2";
    expect(savedProfile(2000)).toBeNull();
    subject = null; // no saved sign-in, or one still arriving in the address
    expect(savedProfile(2000)).toBeNull();
    rememberProfile({ id: "u3" }, 3000); // nothing to tie it to: not saved
    subject = "sb:person-1";
    expect(savedProfile(4000)).toEqual(person);
  });

  it("waits for the server again after a month away", () => {
    rememberProfile(person, 0);
    expect(savedProfile(SAVED_PROFILE_MAX_AGE_MS - 1)).toEqual(person);
    expect(savedProfile(SAVED_PROFILE_MAX_AGE_MS + 1)).toBeNull();
  });

  it("is forgotten on sign-out, and survives broken or blocked storage", () => {
    rememberProfile(person, 1000);
    forgetProfile();
    expect(savedProfile(2000)).toBeNull();
    window.localStorage.setItem("tt_saved_profile_v1", "{not json");
    expect(savedProfile(2000)).toBeNull();
    vi.stubGlobal("window", { localStorage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } } });
    expect(() => rememberProfile(person)).not.toThrow();
    expect(savedProfile()).toBeNull();
    expect(() => forgetProfile()).not.toThrow();
  });

  it("keeps the app's public settings for the next opening", () => {
    expect(savedPublicSettings()).toBeNull();
    rememberPublicSettings({ id: "app", public_settings: {} });
    rememberPublicSettings(null);
    expect(savedPublicSettings()).toEqual({ id: "app", public_settings: {} });
  });
});
