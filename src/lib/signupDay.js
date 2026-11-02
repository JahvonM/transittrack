// Sign-up day at a hotel (Admin → Sign-up day): the four things each staff
// member leaves with, in the order they work best on an iPhone (join and
// sign in first in Safari, then add the app to the Home Screen).

export const STEPS = [
  { id: "signed", label: "Signed in" },
  { id: "app", label: "App" },
  { id: "pickup", label: "Pickup" },
  { id: "card", label: "Card" },
];

export function stepsOf(person) {
  return {
    signed: !!person?.registered,
    app: !!person?.app,
    pickup: !!person?.pickup,
    card: person?.card === "issued",
  };
}
export const isReady = (person) => Object.values(stepsOf(person)).every(Boolean);

export function progress(people = []) {
  const counts = { signed: 0, app: 0, pickup: 0, card: 0, ready: 0, total: people.length };
  for (const p of people) {
    const s = stepsOf(p);
    for (const id of Object.keys(s)) if (s[id]) counts[id] += 1;
    if (isReady(p)) counts.ready += 1;
  }
  return counts;
}

// view: all | todo (not ready, nobody else helping) | mine | ready
export function visiblePeople(people = [], view = "all", query = "") {
  const term = String(query || "").trim().toLowerCase();
  return people
    .filter((p) => !term || [p.name, p.email, p.phone, p.employee_id].filter(Boolean).join(" ").toLowerCase().includes(term))
    .filter((p) => view === "all" ? true
      : view === "mine" ? !!p.helper?.mine
      : view === "ready" ? isReady(p)
      : !isReady(p) && (!p.helper || p.helper.mine))
    .sort((a, b) => (Number(!!b.helper?.mine) - Number(!!a.helper?.mine))
      || (Number(isReady(a)) - Number(isReady(b)))
      || String(a.name).localeCompare(String(b.name)));
}

const HEADERS = {
  name: /^(full ?name|name|staff|employee name|first ?name)$/i,
  email: /^(e-?mail|email address)$/i,
  phone: /^(phone|mobile|cell|phone number|tel)$/i,
  employee_id: /^(employee ?(id|number|no)|staff ?(id|number|no)|id)$/i,
  last: /^(last ?name|surname)$/i,
};

function splitRow(line, sep) {
  const out = [];
  let cell = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell.trim()) quoted = true;
    else if (ch === sep) { out.push(cell.trim()); cell = ""; }
    else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

// The hotel's staff list, pasted from a spreadsheet or read from a .csv file:
// comma, semicolon or tab separated, with or without a header row. Without
// headers the columns are taken as name, email, phone, employee ID, except
// that an email address is recognised in whichever column it is.
export function parseStaffList(textValue) {
  const lines = String(textValue || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0];
  const sep = first.includes("\t") ? "\t" : (first.split(";").length > first.split(",").length ? ";" : ",");
  const rows = lines.map((l) => splitRow(l, sep));
  const header = rows[0].map((h) => h.trim());
  const columns = {};
  header.forEach((h, i) => { for (const [key, re] of Object.entries(HEADERS)) if (columns[key] == null && re.test(h)) columns[key] = i; });
  const hasHeader = columns.name != null || columns.email != null;
  const body = hasHeader ? rows.slice(1) : rows;
  return body.map((cells) => {
    if (hasHeader) {
      const get = (key) => (columns[key] != null ? cells[columns[key]] || "" : "");
      const name = [get("name"), get("last")].filter(Boolean).join(" ");
      return { name, email: get("email"), phone: get("phone"), employee_id: get("employee_id") };
    }
    const emailAt = cells.findIndex((c) => /@/.test(c));
    const rest = cells.filter((_, i) => i !== emailAt);
    return { name: rest[0] || "", email: emailAt >= 0 ? cells[emailAt] : "", phone: rest[1] || "", employee_id: rest[2] || "" };
  }).filter((r) => r.name || r.email);
}

// Setup emails (a personal link to set up the app): what happened, in words.
export const INVITE_BATCH = 20;
export function inviteText(status, name = "") {
  const who = String(name || "").trim().split(/\s+/)[0] || "They";
  switch (status) {
    case "sent": return `Setup email sent to ${who}.`;
    case "off": return "Setup emails are switched off in Admin → Notifications.";
    case "no_email": return `${who} has no email address on the list.`;
    case "signed_in": return `${who} has already signed in, so no setup email is needed.`;
    case "just_sent": return `A setup email went to ${who} a moment ago. Give it a couple of minutes.`;
    case "not_on_list": return `${who} isn't on this hotel's list.`;
    default: return "The setup email couldn't be sent. Try again.";
  }
}
