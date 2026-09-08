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

function cellValue(row, key) {
  const val = row?.[key];
  if (val == null) return "";
  if (Array.isArray(val)) return val.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : x)).join("; ");
  if (typeof val === "object") return JSON.stringify(val);
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

function ensureExt(name, ext) {
  return String(name).toLowerCase().endsWith(ext) ? name : `${name}${ext}`;
}

export function exportToCSV(filename, columns, rows) {
  const cols = columns || [];
  const header = cols.map((c) => `"${String(c.label ?? c.key).replace(/"/g, '""')}"`).join(",");
  const lines = (rows || []).map((row) =>
    cols.map((c) => `"${cellValue(row, c.key).replace(/"/g, '""')}"`).join(",")
  );
  // BOM so Excel reads UTF-8 correctly
  const csv = "\uFEFF" + [header, ...lines].join("\r\n");
  downloadBlob(csv, ensureExt(filename, ".csv"), "text/csv;charset=utf-8;");
}

export async function exportToPDF(filename, title, columns, rows) {
  const { jsPDF } = await import("jspdf");
  const cols = columns || [];
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 28;
  const usableW = pageW - margin * 2;
  const colW = usableW / Math.max(cols.length, 1);
  const rowH = 15;
  const headerH = 20;

  doc.setFontSize(15);
  doc.setTextColor(20);
  doc.text(title, margin, margin + 4);
  doc.setFontSize(9);
  doc.setTextColor(130);
  doc.text(
    `${(rows || []).length} records · ${new Date().toLocaleString()}`,
    margin,
    margin + 18
  );
  doc.setTextColor(20);

  let y = margin + 30;

  const drawHeader = () => {
    doc.setFillColor(225, 232, 245);
    doc.rect(margin, y, usableW, headerH, "F");
    doc.setFontSize(8);
    doc.setFont(undefined, "bold");
    cols.forEach((c, i) => {
      doc.text(
        String(c.label ?? c.key).slice(0, Math.floor(colW / 4.5)),
        margin + i * colW + 4,
        y + 13
      );
    });
    doc.setFont(undefined, "normal");
    y += headerH;
  };

  drawHeader();
  doc.setFontSize(7.5);

  (rows || []).forEach((row, idx) => {
    if (y > pageH - margin) {
      doc.addPage();
      y = margin;
      drawHeader();
      doc.setFontSize(7.5);
    }
    if (idx % 2 === 0) {
      doc.setFillColor(247, 249, 252);
      doc.rect(margin, y, usableW, rowH, "F");
    }
    cols.forEach((c, i) => {
      doc.text(
        cellValue(row, c.key).slice(0, Math.floor(colW / 4.2)),
        margin + i * colW + 4,
        y + 11
      );
    });
    y += rowH;
  });

  doc.save(ensureExt(filename, ".pdf"));
}