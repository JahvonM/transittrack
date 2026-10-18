import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Server functions read app secrets through `secrets` from 'base44:runtime'.
// The test harness hands every function a `secrets` of its own, so a function
// that forgets the import passes its tests but can't see any secret once
// deployed (the Copy data to Supabase button said "add SUPABASE_URL" with the
// secret already saved). This checks the import is there.
const dir = path.resolve(__dirname, "../../../base44/functions");

describe("server functions that read secrets import them", () => {
  const files = fs.readdirSync(dir)
    .map((name) => path.join(dir, name, "entry.ts"))
    .filter((file) => fs.existsSync(file));
  const readers = files.filter((file) => /\bsecrets\.get\(/.test(fs.readFileSync(file, "utf8")));

  it("finds the functions that read secrets", () => {
    expect(readers.length).toBeGreaterThan(5);
  });

  for (const file of readers) {
    it(path.basename(path.dirname(file)), () => {
      expect(fs.readFileSync(file, "utf8")).toMatch(/import\s*\{[^}]*\bsecrets\b[^}]*\}\s*from\s*['"]base44:runtime['"]/);
    });
  }
});
