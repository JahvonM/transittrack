import { describe, it, expect } from "vitest";
import { checkDataModel, readAccessRules, renderDataModel } from "../../../tools/data-model.mjs";

// docs/DATA-MODEL.md is the map of the app's data that people and AI tools
// read before changing anything. It is generated, so it must follow every
// change to base44/entities or to entityAccess. When this fails, run:
//   node tools/data-model.mjs

describe("database map (docs/DATA-MODEL.md)", () => {
  it("is up to date with the entities and the access rules", () => {
    expect(checkDataModel().upToDate, "docs/DATA-MODEL.md is out of date: run node tools/data-model.mjs").toBe(true);
  });

  it("reads who-sees-what from entityAccess itself", () => {
    const rules = readAccessRules();
    expect(rules.sets.CREDENTIALS.has("driver_pin")).toBe(true);
    expect(rules.sets.PASSENGER_READ.has("Trip")).toBe(true);
    expect(rules.sets.COMPANY_READ.has("Driver")).toBe(true); // spread of COMPANY_ENTITIES
    // Passengers' trips leave out other people's details and exact pickup points.
    expect(rules.narrowed.Trip.except).toEqual(["admin", "company"]);
    for (const field of ["passenger_name", "passenger_phone", "pickup_lat", "pickup_lng"]) {
      expect(rules.narrowed.Trip.fields).not.toContain(field);
    }
    expect(rules.fields.Trip).toEqual(expect.arrayContaining(["invoice_id", "pickup_signature_uri"]));
    expect(rules.serverOnly.Trip.has("pickup_signature_uri")).toBe(true);
  });

  it("marks secrets, links and who can read each table", () => {
    const md = renderDataModel();
    expect(md).toMatch(/\| `driver_pin` \| text \| \*\*Secret\*\*: never sent to the browser\. \|/);
    expect(md).toMatch(/\| \[User\]\(#user\) \| `app_user` \| entityAccess \| — \| own profile \| own profile \| own profile \| all \|/);
    expect(md).toMatch(/\| \[CompanyMembership\]\(#companymembership\) \| `company_membership` \| server only \|/);
    expect(md).toContain("| `vehicle_id` | text | → Vehicle. |");
  });
});
