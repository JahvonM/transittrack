// PDFs for jobs: a job sheet (the record of one job, with its signatures) and
// a client invoice. Built in the browser with jsPDF, like the other exports.
import { formatMoney, jobTypeLabel } from "@/lib/jobs";
import { TRANSIT_TIME_ZONE } from "@/lib/localTime";

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { timeZone: TRANSIT_TIME_ZONE, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const day = (date) => (date ? new Date(`${date}T12:00:00Z`).toLocaleDateString([], { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "—");
const safeName = (s) => String(s || "").replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";

function writer(doc) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;
  const room = (h) => { if (y + h > pageH - margin) { doc.addPage(); y = margin; } };
  return {
    margin, pageW, get y() { return y; }, set y(v) { y = v; },
    room,
    title(text, sub) {
      doc.setFont(undefined, "bold"); doc.setFontSize(18); doc.setTextColor(20);
      doc.text(text, margin, y + 14); y += 24;
      if (sub) { doc.setFont(undefined, "normal"); doc.setFontSize(10); doc.setTextColor(100); doc.text(sub, margin, y + 6); y += 16; }
      doc.setTextColor(20);
    },
    heading(text) {
      room(28); y += 8;
      doc.setFont(undefined, "bold"); doc.setFontSize(11); doc.text(text, margin, y + 10); y += 16;
      doc.setDrawColor(226, 232, 240); doc.line(margin, y, pageW - margin, y); y += 6;
      doc.setFont(undefined, "normal");
    },
    // Label on the left, value wrapped on the right.
    field(label, value) {
      if (value === undefined || value === null || value === "") return;
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(String(value), pageW - margin * 2 - 130);
      room(lines.length * 13 + 4);
      doc.setTextColor(100); doc.text(label, margin, y + 10);
      doc.setTextColor(20); doc.text(lines, margin + 130, y + 10);
      y += lines.length * 13 + 3;
    },
  };
}

// One job: what it was, when each step happened, and both signatures.
// signatures: { pickup, dropoff } as image data URLs (from jobBilling).
export async function jobSheetPdf(job, signatures = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = writer(doc);
  w.title(`Job sheet: ${jobTypeLabel(job)}`, [job.company_name, `Job ${String(job.id || "").slice(-8).toUpperCase()}`].filter(Boolean).join(" · "));

  w.heading("Job");
  w.field("Client", job.client_name);
  w.field("Pickup", [job.pickup_name, job.pickup_address !== job.pickup_name ? job.pickup_address : ""].filter(Boolean).join(", "));
  w.field("Drop-off", [job.dropoff_name, job.dropoff_address !== job.dropoff_name ? job.dropoff_address : ""].filter(Boolean).join(", "));
  if (job.stops?.length) w.field("Tour stops", job.stops.map((s, i) => `${i + 1}. ${s.name}${s.reached_at ? ` (reached ${when(s.reached_at)})` : ""}`).join("\n"));
  w.field("Flight", job.flight_number ? `${job.flight_number}${job.flight_time ? `, ${job.job_type === "airport_dropoff" ? "departs" : "lands"} ${when(job.flight_time)}` : ""}` : "");
  w.field("Lead guest", [job.passenger_name, job.passenger_phone].filter(Boolean).join(", "));
  w.field("Guests", job.guests ?? "");
  w.field("Bags", job.luggage ?? "");
  w.field("Notes", job.notes);
  w.field("Bus", [job.vehicle_name, job.plate_number].filter(Boolean).join(" · "));
  w.field("Driver", job.driver_name);
  w.field("Price", formatMoney(job.price, job.currency));
  w.field("Invoice", job.invoice_number);

  w.heading("Times");
  w.field("Booked for", when(job.scheduled_time));
  w.field("Started", when(job.started_at));
  w.field("Arrived", when(job.arrived_at));
  w.field("Completed", when(job.completed_at));

  for (const mode of ["pickup", "dropoff"]) {
    const signedAt = job[`${mode}_signed_at`];
    w.heading(mode === "pickup" ? "Pickup signature" : "Drop-off signature");
    if (!signedAt) { w.field("Signed", "Not signed"); continue; }
    w.field("Signed by", job[`${mode}_signed_by`] || "—");
    w.field("Signed at", when(signedAt));
    w.field("Guests", job[`${mode}_signed_guests`] ?? "");
    const lat = job[`${mode}_signed_lat`], lng = job[`${mode}_signed_lng`];
    if (lat != null && lng != null) w.field("Where", `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`);
    const image = signatures[mode];
    if (image && image.startsWith("data:image/")) {
      w.room(110);
      try {
        doc.addImage(image, "PNG", w.margin + 130, w.y + 4, 240, 90);
        doc.setDrawColor(226, 232, 240); doc.rect(w.margin + 130, w.y + 4, 240, 90);
      } catch { /* a damaged image never stops the sheet */ }
      w.y += 100;
    }
  }

  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Printed ${when(new Date().toISOString())}`, w.margin, doc.internal.pageSize.getHeight() - 20);
  doc.save(`job-${safeName(job.pickup_name)}-${String(job.scheduled_time || "").slice(0, 10) || "sheet"}.pdf`);
}

// A client invoice from its saved lines.
export async function invoicePdf(invoice, company = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = writer(doc);
  const right = w.pageW - w.margin;
  w.title(invoice.status === "void" ? "INVOICE (VOID)" : "INVOICE", invoice.number);

  doc.setFontSize(10);
  const from = [company.name || invoice.company_name, company.phone].filter(Boolean);
  const to = [invoice.client_name, invoice.client_address, invoice.client_email].filter(Boolean);
  const top = w.y + 6;
  doc.setFont(undefined, "bold"); doc.text("From", w.margin, top); doc.text("Bill to", w.margin + 260, top);
  doc.setFont(undefined, "normal");
  from.forEach((line, i) => doc.text(doc.splitTextToSize(line, 230)[0], w.margin, top + 14 + i * 13));
  to.forEach((line, i) => doc.text(doc.splitTextToSize(line, 230)[0], w.margin + 260, top + 14 + i * 13));
  w.y = top + 18 + Math.max(from.length, to.length) * 13;

  w.field("Issued", day(String(invoice.issued_at || "").slice(0, 10)));
  w.field("Due", day(invoice.due_date));
  w.field("For jobs from", `${day(invoice.period_start)} to ${day(invoice.period_end)}`);

  w.heading("Jobs");
  doc.setFontSize(9);
  const lines = invoice.lines || [];
  for (const line of lines) {
    const desc = doc.splitTextToSize(line.description || "", right - w.margin - 170);
    w.room(desc.length * 12 + 6);
    doc.setTextColor(100); doc.text(day(line.date), w.margin, w.y + 10);
    doc.setTextColor(20); doc.text(desc, w.margin + 80, w.y + 10);
    doc.text(formatMoney(line.amount, invoice.currency), right, w.y + 10, { align: "right" });
    w.y += desc.length * 12 + 6;
    doc.setDrawColor(241, 245, 249); doc.line(w.margin, w.y, right, w.y);
  }
  w.room(40); w.y += 10;
  doc.setFont(undefined, "bold"); doc.setFontSize(12);
  doc.text("Total", right - 160, w.y + 12);
  doc.text(formatMoney(invoice.total, invoice.currency), right, w.y + 12, { align: "right" });
  doc.setFont(undefined, "normal"); w.y += 24;
  if (invoice.notes) { w.heading("Notes"); w.field("", invoice.notes); }
  if (invoice.status === "paid" && invoice.paid_at) { w.y += 8; w.field("Paid", day(String(invoice.paid_at).slice(0, 10))); }
  doc.save(`${safeName(invoice.number)}-${safeName(invoice.client_name)}.pdf`);
}
