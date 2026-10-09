import { describe, it, expect } from "vitest";
import {
  readDesktopSignIn,
  desktopSignInPath,
  desktopCallbackUrl,
  currentSessionToken,
  sendSessionToDesktop,
} from "@/lib/desktopSignIn";

const STATE = "Q2xhdWRlLXRlc3Qtc3RhdGUtdmFsdWUtMDEyMzQ1Njc4OQ";

describe("desktop sign-in handoff", () => {
  it("accepts only links the desktop app could have made", () => {
    expect(readDesktopSignIn(`?port=53123&state=${STATE}&provider=google`)).toEqual({ port: 53123, state: STATE, provider: "google" });
    expect(readDesktopSignIn(`?port=53123&state=${STATE}`).provider).toBe("google");
    for (const bad of [
      "",
      `?port=80&state=${STATE}`,
      `?port=70000&state=${STATE}`,
      `?port=53123abc&state=${STATE}`,
      "?port=53123&state=short",
      `?port=53123&state=${STATE}<script>`,
      `?port=53123&state=${STATE}&provider=evil`,
      `?port=53123&state=${STATE}&provider=__proto__`,
    ]) {
      expect(readDesktopSignIn(bad), bad).toBeNull();
    }
  });

  it("always posts to loopback on this computer", () => {
    expect(desktopCallbackUrl({ port: 53123 })).toBe("http://127.0.0.1:53123/callback");
    expect(desktopSignInPath({ port: 53123, state: STATE, provider: "apple" })).toBe(`/desktop-signin?port=53123&state=${STATE}&provider=apple`);
  });

  it("reads the stored session and survives blocked storage", () => {
    expect(currentSessionToken({ getItem: () => "abc.def.ghi" })).toBe("abc.def.ghi");
    expect(currentSessionToken({ getItem: () => null }, "fallback")).toBe("fallback");
    expect(currentSessionToken({ getItem: () => { throw new Error("blocked"); } })).toBeNull();
  });

  it("submits a hidden POST form with only the state and token", () => {
    const made = [];
    const doc = {
      createElement: (tag) => {
        const el = { tag, style: {}, children: [], appendChild(c) { this.children.push(c); }, submit() { this.submitted = true; } };
        made.push(el);
        return el;
      },
      body: { appendChild(el) { this.added = el; } },
    };
    const form = sendSessionToDesktop({ port: 53123, state: STATE }, "abc.def.ghi", doc);
    expect(form.method).toBe("POST");
    expect(form.action).toBe("http://127.0.0.1:53123/callback");
    expect(form.submitted).toBe(true);
    expect(form.children.map((c) => [c.type, c.name, c.value])).toEqual([
      ["hidden", "state", STATE],
      ["hidden", "token", "abc.def.ghi"],
    ]);
    expect(doc.body.added).toBe(form);
  });
});
