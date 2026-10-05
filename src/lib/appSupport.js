import { base44 } from "@/api/base44Client";

// The app support WhatsApp number (Admin -> Settings). Fetched once per page
// load; "" when none is set or it can't be loaded.
let pending = null;

export function loadSupportNumber({ fresh = false } = {}) {
  if (!pending || fresh) {
    pending = base44.functions.invoke("appSupport", { action: "get" })
      .then(({ data }) => (/^\d{7,15}$/.test(data?.whatsapp_number || "") ? data.whatsapp_number : ""))
      .catch(() => { pending = null; return ""; });
  }
  return pending;
}

export async function saveSupportNumber(number) {
  const { data } = await base44.functions.invoke("appSupport", { action: "set", whatsapp_number: number });
  pending = Promise.resolve(data?.whatsapp_number || "");
  return data?.whatsapp_number || "";
}

export function whatsappLink(number, where = "") {
  const text = `Hi, I have a problem with the TransitTrack app${where ? ` (${where})` : ""}: `;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
