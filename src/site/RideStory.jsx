import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bus, ChevronDown, MapPin } from "lucide-react";
import { SITE_SERVICES } from "@/lib/bookingSite";
import DestinationSign from "@/site/DestinationSign";
import { SCENES, sceneAt, sceneProgress, scrollTopFor, storyProgress } from "@/site/rideStory";

// The opening story: the screen stays put while scrolling moves it through
// five shots of the ride.
//   1. the van in its panel, pulled out to fill the screen
//   2. a close-up push onto the front of the van
//   3. the van alone on a glowing road at night, lane lines rushing past
//   4. a route drawing itself, a bus riding it to "You"
//   5. where to? and the buttons
// Scrolling drives everything through CSS variables (--p for the whole
// story, --s1 to --s5 for each shot), set once a frame without re-rendering.
// People who ask for less motion get the still opening instead (HomePage).

const service = (id) => SITE_SERVICES.find((s) => s.id === id)?.text || "";

// The route on the tracking shot, drawn in a 1000 x 600 box.
const ROUTE = "M 70 500 C 230 470 250 250 420 280 S 640 470 760 330 S 870 140 940 110";
const STOPS = [{ at: 0, label: "Pickup" }, { at: 0.5, label: "Grand Anse" }, { at: 1, label: "You" }];

export default function RideStory({ to }) {
  const root = useRef(null);
  const route = useRef(null);
  const bus = useRef(null);
  const copies = useRef([]);
  const [scene, setScene] = useState(0);
  const [stops, setStops] = useState([]);

  // Where the stops sit on the route, as a share of the box.
  useEffect(() => {
    const path = route.current;
    if (!path?.getTotalLength) return;
    const len = path.getTotalLength();
    setStops(STOPS.map((s) => { const pt = path.getPointAtLength(len * s.at); return { ...s, x: pt.x / 10, y: pt.y / 6 }; }));
  }, []);

  useEffect(() => {
    const el = root.current;
    const path = route.current;
    if (!el) return undefined;
    const len = path?.getTotalLength ? path.getTotalLength() : 0;
    let frame = 0, last = -1;
    const update = () => {
      frame = 0;
      const box = el.getBoundingClientRect();
      const p = storyProgress(box.top, box.height, window.innerHeight);
      el.style.setProperty("--p", p.toFixed(4));
      SCENES.forEach((_, i) => el.style.setProperty(`--s${i + 1}`, sceneProgress(p, i).toFixed(4)));
      // The bus rides the route as the tracking shot plays.
      if (len && bus.current) {
        const pt = path.getPointAtLength(len * sceneProgress(p, 3));
        bus.current.style.left = pt.x / 10 + "%";
        bus.current.style.top = pt.y / 6 + "%";
      }
      const now = sceneAt(p);
      if (now !== last) { last = now; setScene(now); }
    };
    const ask = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", ask); window.removeEventListener("resize", ask); };
  }, []);

  // Words and buttons of the shots not on screen can't be reached by Tab.
  useEffect(() => {
    copies.current.forEach((c, i) => { if (c) c.inert = i !== scene; });
  }, [scene]);

  const go = (i) => {
    const el = root.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    window.scrollTo({ top: scrollTopFor(i, box.top + window.scrollY, box.height, window.innerHeight), behavior: "smooth" });
  };
  const copy = (i) => (node) => { copies.current[i] = node; };

  return (
    <section ref={root} className="mcs-story mcs-dark" data-scene={scene} aria-labelledby="hero-title">
      <div className="mcs-story-stage">
        {/* Shots 1 and 2: the van photo. */}
        <div className="mcs-story-photo" aria-hidden="true">
          <img src="/images/mcsween-van.webp" alt="" width="1600" height="900" fetchpriority="high" decoding="async" />
        </div>

        {/* Shot 3: the night road. */}
        <div className="mcs-story-night" aria-hidden="true">
          <span className="mcs-night-sky" />
          <span className="mcs-night-floor" />
          <svg className="mcs-night-road" viewBox="0 0 1000 500" preserveAspectRatio="none">
            <polygon points="470,0 530,0 1000,500 0,500" />
            <line className="mcs-road-edge" x1="470" y1="0" x2="0" y2="500" />
            <line className="mcs-road-edge" x1="530" y1="0" x2="1000" y2="500" />
            <line className="mcs-road-lane" x1="500" y1="0" x2="500" y2="500" />
          </svg>
          <span className="mcs-night-glow" />
          <img className="mcs-night-van" src="/images/mcsween-van-cut.webp" alt="" width="1200" height="731" loading="lazy" decoding="async" />
          <span className="mcs-night-word">Island</span>
        </div>

        {/* Shot 4: the route. */}
        <div className="mcs-story-track" aria-hidden="true">
          <div className="mcs-track-map">
            <svg viewBox="0 0 1000 600" preserveAspectRatio="none">
              <path className="mcs-track-shadow" d={ROUTE} />
              <path ref={route} className="mcs-track-line" d={ROUTE} pathLength="1" />
            </svg>
            {stops.map((s) => (
              <span key={s.label} className="mcs-track-stop" style={{ left: s.x + "%", top: s.y + "%" }} data-end={s.at === 1 ? "" : undefined}>
                <i /><b>{s.label}</b>
              </span>
            ))}
            <span ref={bus} className="mcs-track-bus" style={{ left: "7%", top: "83%" }}><Bus /></span>
          </div>
          <div className="mcs-live-card mcs-track-card">
            <span className="mcs-live-label"><span className="mcs-live-dot" />Live tracking</span>
            <strong>Your bus is on its way</strong>
            <span className="mcs-live-route"><span className="mcs-live-end"><MapPin /> Pickup</span><span className="mcs-live-line"><span className="mcs-live-fill" /></span><span className="mcs-live-end">You</span></span>
          </div>
        </div>

        {/* Shot 5: where to? */}
        <div className="mcs-story-book" aria-hidden="true"><img src="/images/boarding-coast.webp" alt="" width="1200" height="447" loading="lazy" decoding="async" /></div>

        {/* The words for each shot. */}
        <div ref={copy(0)} className="mcs-story-copy mcs-copy-intro">
          <DestinationSign label="Where to?" />
          <h1 id="hero-title">Airport pickups, transfers and island tours in Grenada.</h1>
          <p className="mcs-hero-lede">Tell us where and when. We email you the price and your bus, then send a link so you can watch it on its way to you.</p>
          <div className="mcs-actions">
            <Link className="mcs-btn mcs-btn-primary" to={to("/book")}>Request a ride</Link>
            <Link className="mcs-btn mcs-btn-light" to={to("/track")}>Track a ride</Link>
          </div>
        </div>
        <div ref={copy(1)} className="mcs-story-copy mcs-copy-shot" data-n="2">
          <span className="mcs-story-kicker">Airport pickups and drop-offs</span>
          <h2>Straight from the airport</h2>
          <p>{service("airport_pickup")}</p>
        </div>
        <div ref={copy(2)} className="mcs-story-copy mcs-copy-shot" data-n="3">
          <span className="mcs-story-kicker">Transfers and island tours</span>
          <h2>Anywhere on the island</h2>
          <p>{service("transfer")}</p>
        </div>
        <div ref={copy(3)} className="mcs-story-copy mcs-copy-shot" data-n="4">
          <span className="mcs-story-kicker">Live tracking</span>
          <h2>Watch it come to you</h2>
          <p>Your confirmation has a private link that shows your bus on a map. Only you can see it.</p>
        </div>
        <div ref={copy(4)} className="mcs-story-copy mcs-copy-book">
          <DestinationSign label="Where to?" />
          <h2>Book your ride</h2>
          <p>No account needed. We check a bus is free and email you the price.</p>
          <div className="mcs-actions">
            <Link className="mcs-btn mcs-btn-primary" to={to("/book")}>Request a ride</Link>
            <Link className="mcs-btn mcs-btn-light" to={to("/track")}>Track a ride</Link>
          </div>
        </div>

        {/* Where you are in the story; each number jumps to its shot. */}
        <nav className="mcs-story-rail" aria-label="Story">
          {SCENES.map((s, i) => (
            <button key={s.id} type="button" aria-current={scene === i ? "step" : undefined} onClick={() => go(i)} aria-label={`Go to ${s.label}`}>
              <span>{String(i + 1).padStart(2, "0")}</span><b>{s.label}</b>
            </button>
          ))}
        </nav>
        <span className="mcs-story-hint" aria-hidden="true">Scroll <ChevronDown /></span>
        <span className="mcs-story-bar" aria-hidden="true" />
      </div>
    </section>
  );
}
