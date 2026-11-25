import { describe, it, expect, vi } from "vitest";
vi.mock("npm:@base44/sdk@0.8.44", () => ({ createClientFromRequest: vi.fn() }));
import handler, { businessDetails, readBusiness } from "../../../base44/functions/appSupport/entry.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { cancellationRule } from "@/lib/appSupport";

// Admin -> Settings -> Business details: the contact details and
// free-cancellation rule shown on the Terms page.

function setup({ role = null, row = null } = {}) {
  const saved = [];
  const db = {
    list: vi.fn(async () => (row ? [row] : [])),
    update: vi.fn(async (id, d) => { saved.push(["update", id, d]); return d; }),
    create: vi.fn(async (d) => { saved.push(["create", d]); return d; }),
  };
  vi.mocked(createClientFromRequest).mockReturnValue({
    auth: { me: async () => (role ? { id: "u1", role } : null) },
    asServiceRole: { entities: { AppSupportSetting: db } },
  });
  return { saved };
}
const call = async (body) => {
  const res = await handler(new Request("https://x/f", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

describe("business details", () => {
  it("anyone can read them (they're public), with odd stored values left out", async () => {
    setup({ row: { id: "s1", whatsapp_number: "14735550100", contact_email: "bookings@example.com", contact_phone: "+1 473 555 0199", business_address: "Grand Anse", cancel_free_hours: 24, cancel_late_charge: "the full price" } });
    expect((await call({ action: "get" })).body).toEqual({
      whatsapp_number: "14735550100",
      business: { contact_email: "bookings@example.com", contact_phone: "+1 473 555 0199", business_address: "Grand Anse", cancel_free_hours: 24, cancel_late_charge: "the full price" },
    });
    expect(businessDetails({ contact_email: "nope", contact_phone: "call me", cancel_free_hours: 2.5 })).toMatchObject({ contact_email: "", contact_phone: "", cancel_free_hours: null });
    setup();
    expect((await call({ action: "get" })).body.business).toEqual({ contact_email: "", contact_phone: "", business_address: "", cancel_free_hours: null, cancel_late_charge: "" });
  });

  it("only admins change them", async () => {
    setup({ role: "company" });
    expect((await call({ action: "set_business", contact_email: "a@b.co" })).status).toBe(403);
    setup();
    expect((await call({ action: "set_business", contact_email: "a@b.co" })).status).toBe(403);
  });

  it("saves what an admin typed, cleaned up", async () => {
    const { saved } = setup({ role: "admin", row: { id: "s1", whatsapp_number: "14735550100" } });
    const res = await call({ action: "set_business", contact_email: " Bookings@Example.com ", contact_phone: "+1 473 555 0199", business_address: "Grand  Anse,\nGrenada", cancel_free_hours: "24", cancel_late_charge: "the full price" });
    expect(res.body).toEqual({ ok: true, business: { contact_email: "bookings@example.com", contact_phone: "+1 473 555 0199", business_address: "Grand Anse, Grenada", cancel_free_hours: 24, cancel_late_charge: "the full price" } });
    // The WhatsApp number is untouched.
    expect(saved).toEqual([["update", "s1", { contact_email: "bookings@example.com", contact_phone: "+1 473 555 0199", business_address: "Grand Anse, Grenada", cancel_free_hours: 24, cancel_late_charge: "the full price" }]]);
  });

  it("says plainly what to fix", () => {
    const why = (body) => { try { readBusiness(body); return ""; } catch (e) { return e.message; } };
    expect(why({ contact_email: "not-an-email" })).toMatch(/email address/);
    expect(why({ contact_phone: "ring me" })).toMatch(/phone number/);
    expect(why({ cancel_free_hours: "200" })).toMatch(/0 to 168/);
    expect(why({ cancel_free_hours: "1.5" })).toMatch(/whole number/);
    expect(why({ cancel_late_charge: "the full price" })).toMatch(/hours before pickup/);
    expect(why({ business_address: "x".repeat(201) })).toMatch(/too long/);
    expect(why({})).toBe("");
  });

  it("words the cancelling rule for the Terms", () => {
    expect(cancellationRule({ cancel_free_hours: 24, cancel_late_charge: "the full price" })).toBe("Cancelling is free until 24 hours before the pickup time. After that, the full price may be charged.");
    expect(cancellationRule({ cancel_free_hours: 1, cancel_late_charge: "" })).toBe("Cancelling is free until 1 hour before the pickup time.");
    expect(cancellationRule({ cancel_free_hours: 0 })).toBe("Cancelling is free up to the pickup time.");
    expect(cancellationRule({ cancel_free_hours: null, cancel_late_charge: "x" })).toBe("");
  });
});
