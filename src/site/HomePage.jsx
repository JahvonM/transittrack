import React from "react";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { SITE_SERVICES } from "@/lib/bookingSite";
import DestinationSign from "@/site/DestinationSign";
import { showPhone, sitePath, usePageTitle, useSiteBase, useWhatsApp, whatsappTo } from "@/site/siteKit";

const DESCRIPTION = "McSween Transport: airport pickups and drop-offs, transfers, island tours and staff transport in Grenada. Request a ride online and track your bus.";

export default function HomePage() {
  const base = useSiteBase();
  const to = (p) => sitePath(base, p);
  const whatsapp = useWhatsApp();
  usePageTitle("", DESCRIPTION);

  return (
    <>
      <section className="mcs-hero">
        <div className="mcs-wrap">
          <DestinationSign />
          <div className="mcs-intro">
            <div>
              <h1>Airport pickups, transfers and island tours in Grenada.</h1>
              <p>Tell us where and when. We email you the price and your bus, then send a link so you can watch it on its way to you.</p>
              <div className="mcs-actions">
                <Link className="mcs-btn mcs-btn-primary" to={to("/book")}>Request a ride</Link>
                <Link className="mcs-btn mcs-btn-quiet" to={to("/track")}>Track a ride</Link>
              </div>
            </div>
            <img src="/images/boarding-coaster.webp" alt="A white minibus" width="1200" height="800" />
          </div>
        </div>
      </section>

      <section className="mcs-section" id="services" aria-labelledby="services-title">
        <div className="mcs-wrap">
          <h2 id="services-title">What we do</h2>
          <p className="mcs-lede">Each ride is booked just for you or your group.</p>
          <ul className="mcs-services">
            {SITE_SERVICES.map((s) => (
              <li key={s.id}>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
                <Link to={`${to("/book")}?service=${s.id}`} aria-label={`Request ${s.name.toLowerCase()}`}>Request this ride</Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mcs-section mcs-section-glass" id="how" aria-labelledby="how-title">
        <div className="mcs-wrap">
          <h2 id="how-title">How booking works</h2>
          <ol className="mcs-steps">
            <li>
              <span className="mcs-step-n" aria-hidden="true">1</span>
              <div>
                <h3>Send a request</h3>
                <p>Choose the ride, the time and where. It takes a couple of minutes and you don't need an account.</p>
              </div>
            </li>
            <li>
              <span className="mcs-step-n" aria-hidden="true">2</span>
              <div>
                <h3>We confirm by email</h3>
                <p>We check a bus is free and email you the price. Nothing is booked until you get that email.</p>
              </div>
            </li>
            <li>
              <span className="mcs-step-n" aria-hidden="true">3</span>
              <div>
                <h3>Watch your bus come</h3>
                <p>Your confirmation has a private link that shows your bus on a map. Only you can see it, and it stops working a day after the ride.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="mcs-section" id="contact" aria-labelledby="contact-title">
        <div className="mcs-wrap mcs-contact">
          <div>
            <h2 id="contact-title">Talk to us</h2>
            <p className="mcs-lede">For a ride in the next hour, a question about a booking, or a group we should plan for, message us.</p>
          </div>
          <div className="mcs-contact-list">
            {whatsapp ? (
              <>
                <a className="mcs-btn mcs-btn-primary" href={whatsappTo(whatsapp, "Hi McSween Transport, ")} target="_blank" rel="noreferrer">
                  <MessageCircle aria-hidden="true" /> Message us on WhatsApp
                </a>
                <p>Or call <a href={`tel:+${whatsapp}`}>{showPhone(whatsapp)}</a></p>
              </>
            ) : (
              <p>Send a ride request and we'll reply by email.</p>
            )}
            <p className="mcs-hint">McSween's Transport and Reside Co. is based in Grenada. Times on this site are Grenada time.</p>
          </div>
        </div>
      </section>
    </>
  );
}
