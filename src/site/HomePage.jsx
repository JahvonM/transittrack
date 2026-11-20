import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MessageCircle } from "lucide-react";
import { SITE_SERVICES } from "@/lib/bookingSite";
import DestinationSign from "@/site/DestinationSign";
import RideStory from "@/site/RideStory";
import { routeNumber, showPhone, sitePath, usePageTitle, useSiteBase, useWhatsApp, whatsappTo } from "@/site/siteKit";

const DESCRIPTION = "McSween Transport: airport pickups and drop-offs, transfers, island tours and staff transport in Grenada. Request a ride online and track your bus.";

const prefersStill = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

// The still opening, for people who ask their phone for less motion: the
// words on the left, the van on the right (the van on top on a phone).
function StillHero({ to }) {
  return (
    <section className="mcs-hero mcs-dark" aria-labelledby="hero-title">
      <div className="mcs-wrap mcs-hero-grid">
        <div className="mcs-hero-media">
          <img src="/images/mcsween-van.webp" alt="" width="1600" height="900" fetchpriority="high" decoding="async" />
        </div>
        <div className="mcs-hero-body">
          <DestinationSign label="Where to?" />
          <h1 id="hero-title">Airport pickups, transfers and island tours in Grenada.</h1>
          <p className="mcs-hero-lede">Tell us where and when. We email you the price and your bus, then send a link so you can watch it on its way to you.</p>
          <div className="mcs-actions">
            <Link className="mcs-btn mcs-btn-primary" to={to("/book")}>Request a ride</Link>
            <Link className="mcs-btn mcs-btn-light" to={to("/track")}>Track a ride</Link>
          </div>
          <p className="mcs-facts">No account needed. The price is confirmed by email, then you can watch your bus on a map.</p>
        </div>
      </div>
    </section>
  );
}

// Parts of the page that come in as they scroll into view (the departures
// board rows flip in, the booking steps light up along their route).
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
      {still ? <StillHero to={to} /> : <RideStory to={to} />}

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
          <h2 id="how-title">How booking works</h2>
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
                <p>We check a bus is free and email you the price. Nothing is booked until you get that email.</p>
              </div>
            </li>
            <li>
              <span className="mcs-stop" aria-hidden="true">3</span>
              <div>
                <h3>Watch your bus come</h3>
                <p>Your confirmation has a private link that shows your bus on a map. Only you can see it, and it stops working a day after the ride.</p>
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
