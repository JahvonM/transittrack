import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MessageCircle } from "lucide-react";
import { SITE_SERVICES } from "@/lib/bookingSite";
import RideStory, { OpeningStill } from "@/site/RideStory.jsx";
import { routeNumber, showPhone, sitePath, usePageTitle, useSiteBase, useWhatsApp, whatsappTo } from "@/site/siteKit";

const DESCRIPTION = "McSween Transport: airport pickups and drop-offs, transfers, island tours and staff transport in Grenada. Request a ride online and track your ride.";

const prefersStill = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

// Parts of the page that come in as they scroll into view (the rides wipe
// in one after another, the booking steps light up along their route).
function useReveal() {
  useEffect(() => {
    const items = [...document.querySelectorAll(".mcs [data-reveal]")];
    if (!items.length) return undefined;
    if (prefersStill() || typeof IntersectionObserver === "undefined") { items.forEach((el) => el.classList.add("mcs-in")); return undefined; }
    const seen = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("mcs-in"); seen.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -12% 0px" });
    items.forEach((el) => seen.observe(el));
    return () => seen.disconnect();
  }, []);
}

export default function HomePage() {
  const base = useSiteBase();
  const to = (p) => sitePath(base, p);
  const whatsapp = useWhatsApp();
  usePageTitle("", DESCRIPTION);
  const [still] = useState(prefersStill);
  useReveal();

  return (
    <>
      {still ? <OpeningStill to={to} /> : <RideStory to={to} />}

      <section className="mcs-section" id="services" aria-labelledby="services-title">
        <div className="mcs-wrap">
          <div className="mcs-head">
            <h2 id="services-title">What we do</h2>
            <p className="mcs-lede">Each ride is booked just for you or your group.</p>
          </div>
          <div className="mcs-board mcs-dark">
            <div className="mcs-board-top" aria-hidden="true"><span>Route</span><span>Ride</span></div>
            <ul className="mcs-board-list">
              {SITE_SERVICES.map((s, i) => (
                <li key={s.id} className="mcs-board-row" data-reveal style={{ "--i": i }}>
                  <span className="mcs-route" aria-hidden="true">{routeNumber(i)}</span>
                  <h3>{s.name}</h3>
                  <p>{s.text}</p>
                  <Link className="mcs-board-go" to={`${to("/book")}?service=${s.id}`} aria-label={`Request ${s.name.toLowerCase()}`}>
                    Request this ride <ArrowRight aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mcs-section mcs-paper" id="how" aria-labelledby="how-title">
        <div className="mcs-wrap">
          <h2 id="how-title">How to book</h2>
          <ol className="mcs-stops" data-reveal>
            <li>
              <span className="mcs-stop" aria-hidden="true">1</span>
              <div>
                <h3>Send a request</h3>
                <p>Choose the ride, the time and where. It takes a couple of minutes and you don't need an account.</p>
              </div>
            </li>
            <li>
              <span className="mcs-stop" aria-hidden="true">2</span>
              <div>
                <h3>We confirm by email</h3>
                <p>After confirming availability of the transport requested, an email is sent with the price for confirmation.</p>
              </div>
            </li>
            <li>
              <span className="mcs-stop" aria-hidden="true">3</span>
              <div>
                <h3>View live map</h3>
                <p>Your confirmation has a private link that displays your requested transport’s location and estimated time of arrival.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="mcs-night mcs-dark" id="contact" aria-labelledby="contact-title">
        <img src="/images/boarding-coast.webp" alt="" width="1200" height="447" loading="lazy" decoding="async" />
        <div className="mcs-wrap mcs-contact">
          <div>
            <h2 id="contact-title">Talk to us</h2>
            <p className="mcs-lede">For inquiries regarding bookings, tour arrangements, or transportation for special events, please feel free to contact us on WhatsApp. We’ll be happy to assist you.</p>
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
              <>
                <Link className="mcs-btn mcs-btn-primary" to={to("/book")}>Request a ride</Link>
                <p>Send a ride request and we'll reply by email.</p>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
