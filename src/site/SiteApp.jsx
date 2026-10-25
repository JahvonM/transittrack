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
    <header className="mcs-header">
      <div className="mcs-wrap">
        <Link to={to("/")} className="mcs-brand" aria-label="McSween Transport, home">
          <img src={LOGO_URL} alt="" width="42" height="42" />
          <span>McSween Transport</span>
        </Link>
        <nav className="mcs-nav" aria-label="Main">
          <Link className="mcs-nav-more" to={`${to("/")}#services`}>Services</Link>
          <Link className="mcs-nav-more" to={`${to("/")}#contact`}>Contact</Link>
          <Link to={to("/track")}>Track</Link>
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
        <p>McSween's Transport and Reside Co., Grenada</p>
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

// Marketing pages get the site's header and footer; tracking and the legal
// pages keep their own look.
function Framed({ children }) {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.backgroundColor;
    root.style.backgroundColor = "#ffffff";
    return () => { root.style.backgroundColor = before; };
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
