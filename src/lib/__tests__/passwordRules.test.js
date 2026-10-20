import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { passwordProblem, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, PASSWORD_HINT } from "../passwordRules.js";

// One rule for every new password, on every screen that sets one.

describe("new passwords", () => {
  it("must be 8 to 72 characters and not only spaces", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordProblem("")).toMatch(/at least 8 characters/);
    expect(passwordProblem("1234567")).toMatch(/at least 8 characters/);
    expect(passwordProblem("12345678")).toBeNull();
    expect(passwordProblem("a".repeat(MAX_PASSWORD_LENGTH))).toBeNull();
    expect(passwordProblem("a".repeat(MAX_PASSWORD_LENGTH + 1))).toMatch(/72 characters or fewer/);
    expect(passwordProblem("        ")).toMatch(/only spaces/);
    expect(PASSWORD_HINT).toBe("At least 8 characters.");
  });

  it("is checked on every screen that sets a password", () => {
    for (const file of ["src/pages/Register.jsx", "src/pages/ResetPassword.jsx", "src/components/ChangePassword.jsx", "src/components/admin/UsersTab.jsx"]) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).toContain("passwordProblem(");
      expect(source, file).not.toMatch(/password\.length\s*<\s*\d|nw\.length\s*<\s*\d/);
    }
  });
});
