import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Car, ChevronRight, FlaskConical, Hotel, LayoutDashboard, Navigation, ShieldCheck, Usb, Wrench } from "lucide-react";
import { loadBusinessDetails, loadSupportNumber } from "@/lib/appSupport";

const ROLES = {
  driver: { to: "/driver-phone", title: "Driver", icon: Car, blurb: "Your shift, trips and one-tap GPS sharing." },
  company: { to: "/company", title: "Company", icon: LayoutDashboard, blurb: "Manage vehicles, routes and trips." },
  staff: { to: "/staff", title: "Hotel staff", icon: Hotel, blurb: "Pickup alerts and buses approaching your stop." },
  admin: { to: "/admin", title: "Admin", icon: ShieldCheck, blurb: "Fleet health, users, roles and scheduling." },
  mechanic: { to: "/mechanic", title: "Mechanic", icon: Wrench, blurb: "Vehicle issues and maintenance chat with drivers." },
  kiosk_bus: { tablet: true, to: "/kiosk", title: "Bus entry kiosk", icon: Usb, blurb: "Badge tap-in board at the vehicle door." },
  kiosk_driver: { tablet: true, to: "/driver", title: "Driver kiosk", icon: Navigation, blurb: "GPS sharing and turn-by-turn navigation." },
  reviewer_sandbox: { to: "/reviewer-sandbox", title: "Reviewer sandbox", icon: FlaskConical, blurb: "Simulated live bus demo for app review." },
};

// Footer: the legal pages the app stores require, then a single quiet entry
// to the staff and tablet workspaces.
export default function WelcomeFooter() {
  const [contact, setContact] = useState({ email: "", whatsapp: "" });

  useEffect(() => {
    let live = true;
    Promise.all([loadBusinessDetails(), loadSupportNumber()]).then(([details, whatsapp]) => {
      if (live) setContact({ email: details.contact_email || "", whatsapp: whatsapp || "" });
    });
    return () => { live = false; };
  }, []);

  return (
    <footer className="tt-welcome-footer">
      <div className="tt-welcome-footer-bar">
        <span>McSween Transport · Grenada</span>
        <nav aria-label="About this service">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          {contact.email && <a href={`mailto:${contact.email}`}>Contact</a>}
          {contact.whatsapp && <a href={`https://wa.me/${contact.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        </nav>
      </div>
      <details className="tt-welcome-access">
        <summary>Staff &amp; tablet access</summary>
        <p>Tablets are paired with an admin code. Drivers unlock with their PIN, so no email account is needed.</p>
        <div className="tt-welcome-workspaces">
          {Object.entries(ROLES).map(([key, r]) => {
            const Icon = r.icon;
            return (
              <Link key={key} to={r.tablet ? r.to : `/login?returnTo=${encodeURIComponent(r.to)}`}>
                <Icon className="w-5 h-5 text-primary shrink-0" />
                <span><strong>{r.title}</strong><small>{r.blurb}</small></span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </Link>
            );
          })}
        </div>
      </details>
    </footer>
  );
}