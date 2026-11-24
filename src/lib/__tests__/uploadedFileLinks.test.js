import fs from "node:fs";
import { describe, expect, it } from "vitest";

// Anyone but an administrator may only save links to the app's own files.
// A photo upload returns a signed link to the private area, which the server
// turns into the stored file when it saves, so that link must be accepted:
// company operators could not save a profile photo without it.
const source = fs.readFileSync("base44/functions/entityAccess/entry.ts", "utf8");
const body = /function appStorageUrl\(value\) \{[\s\S]*?\n\}/.exec(source)?.[0];
const appStorageUrl = new Function(`${body}; return appStorageUrl;`)();
const base = "https://abcdefghijklmnopqrst.supabase.co/storage/v1/object";

describe("links to uploaded files", () => {
  it("accepts public files and the signed link an upload returns", () => {
    expect(appStorageUrl(`${base}/public/public/uploads/a.png`)).toBe(true);
    expect(appStorageUrl(`${base}/sign/private/uploads/a.png?token=x`)).toBe(true);
  });
  it("refuses other sites, plain http and other storage areas", () => {
    expect(appStorageUrl("https://example.com/storage/v1/object/public/public/a.png")).toBe(false);
    expect(appStorageUrl("http://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/public/a.png")).toBe(false);
    expect(appStorageUrl(`${base}/sign/downloads/a.png?token=x`)).toBe(false);
    expect(appStorageUrl("javascript:alert(1)")).toBe(false);
  });
});
