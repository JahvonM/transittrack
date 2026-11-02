import { describe, it, expect, beforeEach } from "vitest";
import { confirmPasswordReset, rememberPasswordReset } from "@/lib/passwordNotice";

// After a password reset with an email link, the next sign-in on that
// browser asks once for the "password changed" email.

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
});

describe("password changed notice", () => {
  it("asks once after a reset on this browser", async () => {
    const asked = [];
    const invoke = async (body) => { asked.push(body); };
    expect(await confirmPasswordReset(invoke)).toBe(false);
    rememberPasswordReset();
    expect(await confirmPasswordReset(invoke)).toBe(true);
    expect(await confirmPasswordReset(invoke)).toBe(false);
    expect(asked).toHaveLength(1);
    expect(asked[0].action).toBe("password_changed");
    expect(Date.parse(asked[0].changed_at)).toBeGreaterThan(Date.now() - 5000);
  });
  it("keeps it for next time if the request fails, and forgets one older than a day", async () => {
    rememberPasswordReset();
    expect(await confirmPasswordReset(async () => { throw new Error("offline"); })).toBe(false);
    expect(await confirmPasswordReset(async () => {})).toBe(true);
    rememberPasswordReset(Date.now() - 2 * 86_400_000);
    const asked = [];
    expect(await confirmPasswordReset(async (b) => { asked.push(b); })).toBe(false);
    expect(asked).toEqual([]);
  });
});
