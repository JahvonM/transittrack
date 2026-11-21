import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { SCENES, sceneAt, sceneProgress, scrollTopFor, storyProgress } from "@/site/rideStory";

// The website's opening, after a speedboat site the owner liked: full-screen
// photos under a see-through header, a big wide headline on the left, white
// pill buttons, the shot numbers down the right, a glass card in the corner
// and a turning "scroll down" badge.
//
// The screen stays put while scrolling moves through the shots. Each new
// photo wipes up over the last and its headline rises in line by line;
// within a shot the photo settles as you scroll (--s1 to --s3, set once a
// frame without re-rendering). People who ask for less motion get the first
// shot on its own (OpeningStill).

const SHOTS = [
  {
    // Front: the McSween van, with its plate.
    img: "/images/mcsween-van.webp", w: 1600, h: 900,
    title: ["Airport", "to", "anywhere"], level: 1,
    text: "Airport pickups, transfers and island tours in Grenada. Tell us where and when, and we email you the price and your bus.",
    card: { label: "Request a ride", value: "2 min", note: "That's all a request takes. No account needed.", to: "/book", go: "Start a ride request" },
  },
  {
    // Side: the van at sunset on the coast road.
    img: "/images/van-side.webp", w: 1672, h: 941,
    title: ["Anywhere", "on the", "island"], level: 2,
    text: "Hotels, villas, restaurants and events, or a day out around Grenada for your group. Each ride is booked just for you.",
    // No card: it would sit on the van's back wheel.
    card: null,
  },
  {
    // From above: the van on the road by the sea.
    img: "/images/van-top.webp", w: 1672, h: 941,
    title: ["Watch", "your bus", "arrive"], level: 2,
    text: "Your confirmation has a private link that shows your bus on a map. Only you can see it.",
    card: { label: "Tracking link", value: "Live", note: "Private to you. It stops working a day after the ride.", to: "/track", go: "Open ride tracking" },
  },
];

// While the opening is under the header, the header goes see-through
// (.mcs[data-over-hero] in site.css).
function useOverHero(ref) {
  useEffect(() => {
    const el = ref.current;
    const page = el?.closest(".mcs");
    if (!el || !page) return undefined;
    let frame = 0;
    const check = () => {
      frame = 0;
      const header = page.querySelector(".mcs-header");
      // Solid again once the opening is mostly scrolled away, so its buttons
      // never show through the header.
      page.toggleAttribute("data-over-hero", el.getBoundingClientRect().bottom > Math.max((header?.offsetHeight || 0) + 1, window.innerHeight * 0.5));
    };
    const ask = () => { if (!frame) frame = requestAnimationFrame(check); };
    check();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", ask); window.removeEventListener("resize", ask); page.removeAttribute("data-over-hero"); };
  }, [ref]);
}

function Shot({ shot, i, on }) {
  return (
    <div className="mcs-shot" data-i={i} data-on={on ? "" : undefined} style={{ "--k": `var(--s${i + 1}, 0)` }}>
      <img src={shot.img} alt="" width={shot.w} height={shot.h} fetchpriority={i === 0 ? "high" : undefined} loading={i === 0 ? undefined : "lazy"} decoding="async" />
    </div>
  );
}

const Copy = React.forwardRef(function Copy({ shot, i, on }, ref) {
  const Heading = shot.level === 1 ? "h1" : "h2";
  return (
    <div ref={ref} className="mcs-open-copy" data-i={i} data-on={on ? "" : undefined}>
      <Heading id={i === 0 ? "hero-title" : undefined} className="mcs-open-title">
        {shot.title.map((line, n) => (
          <React.Fragment key={line}>
            {n > 0 && " "}
            <span className="mcs-line"><span style={{ "--n": n }}>{line}</span></span>
          </React.Fragment>
        ))}
      </Heading>
      <p>{shot.text}</p>
    </div>
  );
});

const Card = React.forwardRef(function Card({ shot, i, on, to }, ref) {
  const { card } = shot;
  if (!card) return null;
  return (
    <div ref={ref} className="mcs-open-card" data-i={i} data-on={on ? "" : undefined}>
      <span className="mcs-open-card-label">{card.label}</span>
      <strong>{card.value}</strong>
      <p>{card.note}</p>
      <img className="mcs-open-card-van" src="/images/mcsween-van-cut.webp" alt="" width="1200" height="731" loading="lazy" decoding="async" />
      {card.to.startsWith("#")
        ? <a className="mcs-open-card-go" href={card.to} aria-label={card.go}><ArrowUpRight aria-hidden="true" /></a>
        : <Link className="mcs-open-card-go" to={to(card.to)} aria-label={card.go}><ArrowUpRight aria-hidden="true" /></Link>}
    </div>
  );
});

function Actions({ to }) {
  return (
    <div className="mcs-open-actions">
      <Link className="mcs-btn mcs-btn-primary" to={to("/book")}>Request a ride</Link>
      <Link className="mcs-btn mcs-btn-light mcs-btn-ring" to={to("/track")}>Track a ride <span aria-hidden="true"><ArrowUpRight /></span></Link>
    </div>
  );
}

// The first shot alone, still: for people who ask their phone for less motion.
export function OpeningStill({ to }) {
  const root = useRef(null);
  useOverHero(root);
  return (
    <section ref={root} className="mcs-hero mcs-dark" aria-labelledby="hero-title">
      <div className="mcs-shots" aria-hidden="true"><Shot shot={SHOTS[0]} i={0} on /></div>
      <Copy shot={SHOTS[0]} i={0} on />
      <Actions to={to} />
      <Card shot={SHOTS[0]} i={0} on to={to} />
    </section>
  );
}

export default function RideStory({ to }) {
  const root = useRef(null);
  const copies = useRef([]);
  const cards = useRef([]);
  const [scene, setScene] = useState(0);
  useOverHero(root);

  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    let frame = 0, last = -1;
    const update = () => {
      frame = 0;
      const box = el.getBoundingClientRect();
      const p = storyProgress(box.top, box.height, window.innerHeight);
      SCENES.forEach((_, i) => el.style.setProperty(`--s${i + 1}`, sceneProgress(p, i).toFixed(4)));
      const now = sceneAt(p);
      if (now !== last) { last = now; setScene(now); }
    };
    const ask = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", ask); window.removeEventListener("resize", ask); };
  }, []);

  // The words and card links of shots not on screen can't be reached by Tab.
  useEffect(() => {
    [copies.current, cards.current].forEach((list) => list.forEach((c, i) => { if (c) c.inert = i !== scene; }));
  }, [scene]);

  const go = (i) => {
    const el = root.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const sectionTop = box.top + window.scrollY;
    const top = i < SCENES.length ? scrollTopFor(i, sectionTop, box.height, window.innerHeight) : sectionTop + box.height;
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <section ref={root} className="mcs-story mcs-dark" data-scene={scene} aria-labelledby="hero-title">
      <div className="mcs-story-stage">
        <div className="mcs-shots" aria-hidden="true">
          {SHOTS.map((s, i) => <Shot key={s.img} shot={s} i={i} on={i <= scene} />)}
        </div>
        {SHOTS.map((s, i) => <Copy key={s.img} ref={(n) => { copies.current[i] = n; }} shot={s} i={i} on={i === scene} />)}
        <Actions to={to} />
        {SHOTS.map((s, i) => <Card key={s.img} ref={(n) => { cards.current[i] = n; }} shot={s} i={i} on={i === scene} to={to} />)}

        {/* Each number goes straight to its shot. */}
        <nav className="mcs-story-rail" aria-label="Story">
          {SCENES.map((s, i) => (
            <button key={s.id} type="button" aria-current={scene === i ? "step" : undefined} onClick={() => go(i)} aria-label={`Go to ${s.label}`}>
              <b>{s.label}</b><span>{String(i + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </nav>

        <button type="button" className="mcs-scroll" onClick={() => go(scene + 1)} aria-label="Scroll down">
          <svg className="mcs-scroll-ring" viewBox="0 0 100 100" aria-hidden="true">
            <defs><path id="mcs-scroll-path" d="M 50 50 m -38 0 a 38 38 0 1 1 76 0 a 38 38 0 1 1 -76 0" /></defs>
            <text><textPath href="#mcs-scroll-path">Scroll down · Scroll down · </textPath></text>
          </svg>
          <ArrowDown aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
