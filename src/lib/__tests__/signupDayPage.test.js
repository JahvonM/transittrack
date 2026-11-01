import { describe, it, expect } from "vitest";
import { isReady, parseStaffList, progress, stepsOf, visiblePeople } from "../signupDay.js";

const ready = { name: "Ana", registered: true, app: "alerts", pickup: true, card: "issued" };
const half = { name: "Ben", registered: true, app: "", pickup: true, card: "" };
const mine = { name: "Cal", registered: false, app: "", pickup: false, card: "", helper: { name: "Me", mine: true } };
const theirs = { name: "Dee", registered: false, app: "", pickup: false, card: "", helper: { name: "Kerry", mine: false } };

describe("sign-up day page", () => {
  it("counts each step and who is ready", () => {
    expect(stepsOf(half)).toEqual({ signed: true, app: false, pickup: true, card: false });
    expect(isReady(ready)).toBe(true);
    expect(progress([ready, half, mine, theirs])).toEqual({ signed: 2, app: 1, pickup: 2, card: 1, ready: 1, total: 4 });
  });

  it("shows my people first, and leaves other helpers' people out of To do", () => {
    const all = [ready, half, mine, theirs];
    expect(visiblePeople(all, "all").map((p) => p.name)).toEqual(["Cal", "Ben", "Dee", "Ana"]);
    expect(visiblePeople(all, "todo").map((p) => p.name)).toEqual(["Cal", "Ben"]);
    expect(visiblePeople(all, "mine").map((p) => p.name)).toEqual(["Cal"]);
    expect(visiblePeople(all, "ready").map((p) => p.name)).toEqual(["Ana"]);
    expect(visiblePeople(all, "all", "de").map((p) => p.name)).toEqual(["Dee"]);
  });

  it("reads a pasted spreadsheet with headers in any order", () => {
    const pasted = "Email\tFirst name\tLast name\tMobile\tEmployee ID\nana@test.invalid\tAna\tJoseph\t473 555 0101\tH-1\n\tBen\tCharles\t\t\n";
    expect(parseStaffList(pasted)).toEqual([
      { name: "Ana Joseph", email: "ana@test.invalid", phone: "473 555 0101", employee_id: "H-1" },
      { name: "Ben Charles", email: "", phone: "", employee_id: "" },
    ]);
  });

  it("reads a CSV with quotes and semicolons, or with no header row", () => {
    expect(parseStaffList('Name;Email\n"Joseph, Ana";ana@test.invalid\n')).toEqual([{ name: "Joseph, Ana", email: "ana@test.invalid", phone: "", employee_id: "" }]);
    expect(parseStaffList("Ana Joseph,ana@test.invalid,4735550101\nben@test.invalid,Ben Charles\n")).toEqual([
      { name: "Ana Joseph", email: "ana@test.invalid", phone: "4735550101", employee_id: "" },
      { name: "Ben Charles", email: "ben@test.invalid", phone: "", employee_id: "" },
    ]);
    expect(parseStaffList("\n\n")).toEqual([]);
  });
});
