// Shared data export utilities — Excel-compatible CSV and PDF.
// columns: [{ key, label }]; rows: array of record objects.

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Dates are stored as ISO strings ("2026-09-30T14:22:31.123Z"); show them
// the way people read them, in this computer's time zone.
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, "0");

function formatDateValue(val, forSheet) {
  if (ISO_DATETIME.test(val)) {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return val;
    // Spreadsheets: a form Excel recognises as a date and time.
    if (forSheet) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return d.toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  }
  if (ISO_DATE.test(val) && !forSheet) {
    const [y, m, day] = val.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  }
  return val;
}

function cellValue(row, key, forSheet = false) {
  const val = row?.[key];
  if (val == null) return "";
  if (Array.isArray(val)) return val.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : x)).join("; ");
  if (typeof val === "object") return JSON.stringify(val);
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "string") return formatDateValue(val, forSheet).replace(/_/g, (m, i, str) => (/^[a-z_]+$/.test(str) ? " " : m));
  return String(val);
}

function ensureExt(name, ext) {
  return String(name).toLowerCase().endsWith(ext) ? name : `${name}${ext}`;
}

export function exportToCSV(filename, columns, rows) {
  const cols = columns || [];
  const header = cols.map((c) => `"${String(c.label ?? c.key).replace(/"/g, '""')}"`).join(",");
  const lines = (rows || []).map((row) =>
    cols.map((c) => `"${cellValue(row, c.key, true).replace(/"/g, '""')}"`).join(",")
  );
  // BOM so Excel reads UTF-8 correctly
  const csv = "\uFEFF" + [header, ...lines].join("\r\n");
  downloadBlob(csv, ensureExt(filename, ".csv"), "text/csv;charset=utf-8;");
}

export async function exportToPDF(filename, title, columns, rows) {
  const { jsPDF } = await import("jspdf");
  const cols = columns || [];
  const list = rows || [];
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;
  const usableW = pageW - margin * 2;
  const pad = 5;
  const fontSize = 9;
  const lineH = 11.5;

  // Column widths follow how much text each column holds (within limits),
  // and long values wrap onto extra lines instead of being cut off.
  const cells = list.map((row) => cols.map((c) => cellValue(row, c.key)));
  const weights = cols.map((c, i) => {
    const longest = Math.max(String(c.label ?? c.key).length + 3, ...cells.slice(0, 200).map((r) => Math.min(r[i].length, 60)));
    return Math.max(8, Math.min(longest, 40));
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const widths = weights.map((w) => (usableW * w) / total);
  const xs = widths.map((_, i) => margin + widths.slice(0, i).reduce((a, b) => a + b, 0));

  let page = 1;
  const footer = () => {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${title} · page ${page}`, margin, pageH - 14);
    doc.setTextColor(20);
  };

  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.setTextColor(20);
  doc.text(title, margin, margin + 6);
  doc.setFont(undefined, "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(
    `${list.length} record${list.length === 1 ? "" : "s"} · exported ${new Date().toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}`,
    margin,
    margin + 22
  );
  doc.setTextColor(20);
  let y = margin + 36;

  const drawHeader = () => {
    doc.setFontSize(fontSize);
    doc.setFont(undefined, "bold");
    const lines = cols.map((c, i) => doc.splitTextToSize(String(c.label ?? c.key), widths[i] - pad * 2));
    const h = Math.max(...lines.map((l) => l.length)) * lineH + 8;
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, y, usableW, h, "F");
    doc.setTextColor(255);
    lines.forEach((l, i) => doc.text(l, xs[i] + pad, y + 4 + lineH - 2));
    doc.setTextColor(20);
    doc.setFont(undefined, "normal");
    y += h;
  };

  footer();
  drawHeader();
  cells.forEach((r, idx) => {
    doc.setFontSize(fontSize);
    const lines = r.map((v, i) => doc.splitTextToSize(v || "", widths[i] - pad * 2).slice(0, 6));
    const h = Math.max(1, ...lines.map((l) => l.length)) * lineH + 6;
    if (y + h > pageH - margin) {
      doc.addPage();
      page += 1;
      y = margin;
      footer();
      drawHeader();
    }
    if (idx % 2 === 0) {
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, usableW, h, "F");
    }
    doc.setFontSize(fontSize);
    lines.forEach((l, i) => doc.text(l, xs[i] + pad, y + 3 + lineH - 2));
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + h, margin + usableW, y + h);
    y += h;
  });

  doc.save(ensureExt(filename, ".pdf"));
}
