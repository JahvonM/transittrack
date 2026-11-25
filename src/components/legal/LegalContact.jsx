import React, { useEffect, useState } from "react";
import { NO_BUSINESS, loadBusinessDetails, loadSupportNumber } from "@/lib/appSupport";

// How to reach McSween Transport, for the Terms and the Privacy Policy. The
// details come from Admin -> Settings -> Business details (and the support
// WhatsApp number); anything not set there is left out, never made up.
export function useBusinessContact() {
  const [details, setDetails] = useState(NO_BUSINESS);
  const [whatsapp, setWhatsapp] = useState("");
  useEffect(() => {
    let live = true;
    loadBusinessDetails().then((d) => { if (live) setDetails(d); });
    loadSupportNumber().then((n) => { if (live) setWhatsapp(n); });
    return () => { live = false; };
  }, []);
  return { details, whatsapp };
}

export default function LegalContact({ details, whatsapp }) {
  const tel = (v) => v.replace(/[^\d+]/g, "");
  const items = [
    details.contact_email && <li key="email">Email: <a className="font-semibold text-primary hover:underline" href={`mailto:${details.contact_email}`}>{details.contact_email}</a></li>,
    details.contact_phone && <li key="phone">Phone: <a className="font-semibold text-primary hover:underline" href={`tel:${tel(details.contact_phone)}`}>{details.contact_phone}</a></li>,
    whatsapp && <li key="wa">WhatsApp: <a className="font-semibold text-primary hover:underline" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">+{whatsapp}</a></li>,
    details.business_address && <li key="address">Address: {details.business_address}</li>,
  ].filter(Boolean);
  if (!items.length) return <p>Reply to any email we have sent you about your ride. If you use the app, you can also message the office from it.</p>;
  return <ul className="list-disc space-y-1 pl-5">{items}</ul>;
}
