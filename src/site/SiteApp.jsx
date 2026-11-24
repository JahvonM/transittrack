import React, { Suspense, lazy, useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { LOGO_URL } from "@/components/Logo";
import { APP_ORIGIN, isSiteHost, sitePage } from "@/lib/bookingSite";
import { SiteBase, sitePath, useSiteBase } from "@/site/siteKit";
import "@/site/site.css";

// The public website. On mcsweenstransport.com it is the whole site; inside
// the app it can be looked at under /site (the same pages, for checking
// changes before the domain points here).
const HomePage = lazy(() => import("@/site/HomePage"));
const BookPage = lazy(() => import("@/site/BookPage"));
const TrackRide = lazy(() => import("@/pages/TrackRide"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));

function Header() {
  const base = useSiteBase();
  const to = (p) => sitePath(base, p);
  return (
    <header className="mcs-header mcs-dark">
      <div className="mcs-wrap">
        <Link to={to("/")} className="mcs-brand" aria-label="McSween Transport, home">
          <img src={LOGO_URL} alt="" width="42" height="42" />
          <span><b>McSween</b> <b>Transport</b></span>
        </Link>
        <nav className="mcs-nav" aria-label="Main">
          <Link className="mcs-nav-more" to={`${to("/")}#services`}>Services</Link>
          <Link className="mcs-nav-more" to={`${to("/")}#contact`}>Contact</Link>
          <Link className="mcs-nav-wide" to={to("/track")}>Track</Link>
          <Link className="mcs-btn mcs-btn-primary" to={to("/book")}>Request a ride</Link>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const base = useSiteBase();
  const to = (p) => sitePath(base, p);
  return (
    <footer className="mcs-footer">
      <div className="mcs-wrap">
        <div>
          <p className="mcs-footer-brand"><img src={LOGO_URL} alt="" width="34" height="34" loading="lazy" /><strong>McSween Transport</strong></p>
          <p className="mcs-footer-note">McSween's Transport and Reside Co., Grenada. Times on this site are Atlantic Standard Time (GMT-4).</p>
        </div>
        <nav aria-label="More">
          <Link to={to("/book")}>Request a ride</Link>
          <Link to={to("/track")}>Track a ride</Link>
          <Link to={to("/privacy")}>Privacy</Link>
          <Link to={to("/terms")}>Terms</Link>
          <a href={`${APP_ORIGIN}/login`}>Staff sign-in</a>
        </nav>
      </div>
    </footer>
  );
}

// The site's typeface, Archivo (wide for headings and labels, normal width
// for reading), from Google Fonts. Added once, on the site's pages only.
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap";
function useSiteFont() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const head = document.head;
    [["https://fonts.googleapis.com", false], ["https://fonts.gstatic.com", true]].forEach(([href, cross]) => {
      const pre = document.createElement("link");
      pre.rel = "preconnect"; pre.href = href;
      if (cross) pre.crossOrigin = "";
      head.appendChild(pre);
    });
    const font = document.createElement("link");
    font.rel = "stylesheet"; font.href = FONT_HREF;
    head.appendChild(font);
  }, []);
}

// Marketing pages get the site's header and footer; tracking and the legal
// pages keep their own look. The page behind them (seen when a phone pulls
// past the top or bottom) and the browser bar match the dark header.
const SITE_INK = "#0b1f2e";
function Framed({ children }) {
  useSiteFont();
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.backgroundColor;
    const meta = document.querySelector('meta[name="theme-color"]');
    const beforeTheme = meta?.getAttribute("content");
    root.style.backgroundColor = SITE_INK;
    meta?.setAttribute("content", SITE_INK);
    return () => {
      root.style.backgroundColor = before;
      if (meta && beforeTheme != null) meta.setAttribute("content", beforeTheme);
    };
  }, []);
  return (
    <div className="mcs">
      <a className="mcs-skip" href="#main">Skip to the page</a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </div>
  );
}

const Waiting = () => <div className="min-h-[100dvh]" aria-busy="true" />;

// On the website's own address, anything that isn't one of its pages
// belongs to the app.
function ToApp() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => { window.location.replace(`${APP_ORIGIN}${pathname}${search}${hash}`); }, [pathname, search, hash]);
  return <Waiting />;
}

export default function SiteApp({ base = "" }) {
  const { pathname } = useLocation();
  const onSite = !base && typeof window !== "undefined" && isSiteHost(window.location.hostname);
  if (onSite && !sitePage(pathname)) return <ToApp />;
  return (
    <SiteBase.Provider value={base}>
      <Suspense fallback={<Waiting />}>
        <Routes>
          <Route index element={<Framed><HomePage /></Framed>} />
          <Route path="book" element={<Framed><BookPage /></Framed>} />
          <Route path="track" element={<TrackRide />} />
          <Route path="privacy" element={<PrivacyPolicy />} />
          <Route path="terms" element={<TermsOfService />} />
          <Route path="*" element={<Framed><HomePage /></Framed>} />
        </Routes>
      </Suspense>
    </SiteBase.Provider>
  );
}
