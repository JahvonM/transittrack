import { describe, it, expect } from "vitest";
import { firstLetter, initialsOf, nameInitials } from "@/lib/userName";

// The initials circle shows whole characters: a name that starts with an
// emoji or an accented letter never shows a broken "�".
describe("initials", () => {
  it("keeps an emoji whole", () => {
    expect(nameInitials({ display_name: "😀 Smith" })).toBe("😀S");
    expect(nameInitials({ display_name: "👩🏽‍🔧 Ana" })).toBe("👩🏽‍🔧A");
    expect(nameInitials({ full_name: "🇬🇩 Grenada" })).toBe("🇬🇩G");
    // No half of an emoji left on its own.
    const broken = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(initialsOf("😀 Smith")).not.toMatch(broken);
    expect("\uD83DS").toMatch(broken); // what word[0] used to give
  });
  it("still gives plain initials, and ? when there's nothing", () => {
    expect(nameInitials({ full_name: "jane doe" })).toBe("JD");
    expect(nameInitials({ email: "pat.smith@example.com" })).toBe("PS");
    expect(nameInitials({ full_name: "Émile Zola" })).toBe("ÉZ");
    expect(nameInitials({})).toBe("?");
    expect(firstLetter("")).toBe("");
  });
});
