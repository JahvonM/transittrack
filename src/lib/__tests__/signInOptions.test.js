import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { savedSignInOptions, firstGuess } from "../signInOptions.js";
import { signInOptions } from "../../api/backend.supabase.js";

// The sign-in screens only show "Continue with Google / Apple" when that
// provider is turned on, so nobody taps a button that can't work.

const store = (value) => ({ getItem: () => value });

describe("sign-in buttons", () => {
  it("asks Supabase which providers are on", async () => {
    let asked;
    const fetchImpl = async (url, init) => {
      asked = { url, init };
      return new Response(JSON.stringify({ external: { google: true, apple: false, email: true } }), { status: 200 });
    };
    expect(await signInOptions(fetchImpl)).toEqual({ google: true, apple: false });
    expect(asked.url).toBe("https://ghqpznxqngvhmkiwcauj.supabase.co/auth/v1/settings");
    expect(asked.init.headers.apikey).toMatch(/^sb_publishable_/);
    // Offline or refused: no answer, so the screen keeps what it showed last.
    expect(await signInOptions(async () => { throw new Error("offline"); })).toBeNull();
    expect(await signInOptions(async () => new Response("", { status: 500 }))).toBeNull();
  });

  it("starts from the last answer, or a safe guess", () => {
    expect(savedSignInOptions(store(JSON.stringify({ google: true, apple: false })))).toEqual({ google: true, apple: false });
    expect(savedSignInOptions(store("not json"))).toBeNull();
    expect(savedSignInOptions(store(JSON.stringify({ google: "yes" })))).toBeNull();
    expect(firstGuess("supabase")).toEqual({ google: false, apple: false });
    expect(firstGuess("base44")).toEqual({ google: true, apple: true });
  });

  it("is used by both sign-in screens", () => {
    for (const file of ["src/pages/Login.jsx", "src/pages/Register.jsx"]) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).toContain("useSignInOptions()");
      expect(source, file).toContain("{signInWith.google && (");
      expect(source, file).toContain("{signInWith.apple && (");
    }
  });
});
