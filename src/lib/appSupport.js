import { base44 } from "@/api/base44Client";

// The app support WhatsApp number and the business details (Admin ->
// Settings). One public read per page load, shared by both; "" / empty
// details when none are set or they can't be loaded.
let pending = null;
export const NO_BUSINESS = Object.freeze({ contact_email: "", contact_phone: "", business_address: "", cancel_free_hours: null, cancel_late_charge: "" });

function loadSettings({ fresh = false } = {}) {
  if (!pending || fresh) {
    pending = base44.functions.invoke("appSupport", { action: "get" })
      .then(({ data }) => data || {})
      .catch(() => { pending = null; return {}; });
  }
  return pending;
}

export function loadSupportNumber(options) {
  return loadSettings(options).then((data) => (/^\d{7,15}$/.test(data?.whatsapp_number || "") ? data.whatsapp_number : ""));
}

export function loadBusinessDetails(options) {
  return loadSettings(options).then((data) => ({ ...NO_BUSINESS, ...(data?.business || {}) }));
}

export async function saveSupportNumber(number) {
  const { data } = await base44.functions.invoke("appSupport", { action: "set", whatsapp_number: number });
  const saved = data?.whatsapp_number || "";
  const before = await (pending || Promise.resolve({}));
  pending = Promise.resolve({ ...before, whatsapp_number: saved });
  return saved;
}

export async function saveBusinessDetails(details) {
  const { data } = await base44.functions.invoke("appSupport", { action: "set_business", ...details });
  const business = { ...NO_BUSINESS, ...(data?.business || {}) };
  const before = await (pending || Promise.resolve({}));
  pending = Promise.resolve({ ...before, business });
  return business;
}

// The free-cancellation rule in words, or "" when none is set.
export function cancellationRule(details) {
  const hours = details?.cancel_free_hours;
  if (!Number.isInteger(hours)) return "";
  const until = hours === 0 ? "up to the pickup time" : `until ${hours} hour${hours === 1 ? "" : "s"} before the pickup time`;
  const after = details?.cancel_late_charge ? ` After that, ${details.cancel_late_charge} may be charged.` : "";
  return `Cancelling is free ${until}.${after}`;
}

export function whatsappLink(number, where = "") {
  const text = `Hi, I have a problem with the McSween Transport app${where ? ` (${where})` : ""}: `;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
