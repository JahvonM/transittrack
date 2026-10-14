import { describe, expect, it, beforeAll } from "vitest";
import { jsPDF } from "jspdf";
import { invoicePdf, jobSheetPdf } from "../jobDocuments";

// The job sheet and invoice PDFs are made without errors and hold what they should.
const saved = [];
beforeAll(() => {
  const save = function (name) { saved.push({ name, text: this.output() }); };
  jsPDF.API.save = save;
  jsPDF.prototype.save = save;
});
// A 1x1 PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("job documents", () => {
  it("makes a job sheet with both signatures", async () => {
    await jobSheetPdf({
      id: "abcdef123456", job_type: "airport_pickup", company_name: "Island Transit Co.", client_name: "Grand Hotel",
      pickup_name: "Airport", dropoff_name: "Grand Hotel", flight_number: "AA 1", guests: 3, scheduled_time: "2026-10-20T14:00:00Z",
      completed_at: "2026-10-20T15:00:00Z", pickup_signed_at: "2026-10-20T14:05:00Z", pickup_signed_by: "Ms Lee", pickup_signed_role: "reception", pickup_signed_lat: 12.0, pickup_signed_lng: -61.7,
      stops: [{ name: "Fort George", reached_at: "2026-10-20T14:30:00Z" }], price: 60, currency: "USD",
    }, { pickup: PNG, dropoff: null });
    const doc = saved.at(-1);
    expect(doc.name).toBe("job-Airport-2026-10-20.pdf");
    // The PDF escapes brackets in its text.
    expect(doc.text).toContain("Ms Lee \\(hotel front desk\\)");
    expect(doc.text).toContain("US$60.00");
    expect(doc.text).toContain("Not signed");
  });

  it("makes an invoice with its lines and total", async () => {
    await invoicePdf({
      number: "INV-2026-0001", status: "sent", company_name: "Island Transit Co.", client_name: "Grand Hotel", client_address: "Grand Anse",
      issued_at: "2026-10-01T12:00:00Z", due_date: "2026-10-31", period_start: "2026-09-01", period_end: "2026-09-30", currency: "USD", total: 150.5,
      lines: [{ trip_id: "a", date: "2026-09-03", description: "Airport pickup: Airport to Grand Hotel", amount: 100 }, { trip_id: "b", date: "2026-09-20", description: "Transfer", amount: 50.5 }],
    }, { name: "Island Transit Co.", phone: "+1 473 555 0100" });
    const doc = saved.at(-1);
    expect(doc.name).toBe("INV-2026-0001-Grand-Hotel.pdf");
    expect(doc.text).toContain("US$150.50");
    expect(doc.text).toContain("Airport pickup: Airport to Grand Hotel");
  });
});
