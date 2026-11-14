// How a paired tablet's pass stands, as the server reports it to Admin
// (KioskDevice.pass). A pass lasts 90 days. In its last 30 days Admin warns,
// and an admin can renew it (manageAccessCodes renew_pass) for a tablet still
// in use; once it has ended, or the tablet moved, it needs a new pairing code.

const DAY = 86400_000;
const day = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function passNote(pass, now = Date.now()) {
  if (!pass?.state) return null;
  const left = pass.expires_at ? Math.ceil((Date.parse(pass.expires_at) - now) / DAY) : null;
  switch (pass.state) {
    case "moved":
      return { tone: "danger", needsCode: true, label: "Needs a new pairing code",
        text: "Its bus, company or type changed after it was paired, so it can't connect. Press New code and enter the code on the tablet." };
    case "expired":
      return { tone: "danger", needsCode: true, label: "Pass expired",
        text: "It can't connect. Press New code and enter the code on the tablet." };
    case "expiring":
      return { tone: "warning", soon: true, renewable: true, label: `Pass ends ${day(pass.expires_at)}`,
        text: `${left === 1 ? "Tomorrow" : `In ${left} days`}. Before then, press Renew pass if the tablet is still in use, or it stops connecting.` };
    case "none":
      return { tone: "warning", label: "Old pairing",
        text: "Paired before tablet passes existed. Give it a new pairing code when it's convenient." };
    case "ok":
      return pass.expires_at ? { tone: "neutral", label: null, text: `Pass until ${day(pass.expires_at)}` } : null;
    default:
      return null;
  }
}

// For the line above the list: how many need a code now, and how many soon.
export function passSummary(devices, now = Date.now()) {
  let needCode = 0, soon = 0;
  for (const d of devices || []) {
    const note = passNote(d.pass, now);
    if (note?.needsCode) needCode++;
    else if (note?.soon) soon++;
  }
  return { needCode, soon };
}
