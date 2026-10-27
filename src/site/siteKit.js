// Small helpers shared by the website's pages (src/site).
import { createContext, useContext, useEffect, useState } from "react";
import { loadSupportNumber } from "@/lib/appSupport";

// "" on mcsweenstransport.com, "/site" when the pages are opened inside the app.
export const SiteBase = createContext("");
export const useSiteBase = () => useContext(SiteBase);
export const sitePath = (base, path) => `${base}${path === "/" && base ? "" : path}` || "/";

// The WhatsApp number people can message (Admin → Settings).
export function useWhatsApp() {
  const [number, setNumber] = useState("");
  useEffect(() => { let live = true; loadSupportNumber().then((n) => { if (live) setNumber(n); }); return () => { live = false; }; }, []);
  return number;
}
export const showPhone = (digits) => (/^1\d{10}$/.test(digits) ? `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : `+${digits}`);
// "01", "02"… for the n-th ride, like the route number on a bus.
export const routeNumber = (i) => String(i + 1).padStart(2, "0");
export const whatsappTo = (digits, text) => `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

export function usePageTitle(title, description) {
  useEffect(() => {
    document.title = title ? `${title} | McSween Transport` : "McSween Transport | Airport pickups, transfers and island tours in Grenada";
    const meta = document.querySelector('meta[name="description"]');
    const before = meta?.getAttribute("content");
    if (meta && description) meta.setAttribute("content", description);
    return () => { if (meta && before != null) meta.setAttribute("content", before); };
  }, [title, description]);
}

