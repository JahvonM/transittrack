import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import useFutureAppearance from "@/hooks/useFutureAppearance";
import JourneyLoading from "@/components/JourneyLoading";
import Logo from "@/components/Logo";
import LiveClock from "@/components/LiveClock";
import WeatherWidget from "@/components/WeatherWidget";
import { Button } from "@/components/ui/button";
import { Bus, MapPin, MessageCircle, Car, ChevronRight, FlaskConical, Hotel, LayoutDashboard, Navigation, PenLine, ShieldCheck, Usb, Wrench } from "lucide-react";
const ROLES = {
  driver: {
    to: "/driver-phone",
    title: "Driver",
    icon: Car,
    blurb: "Your shift, trips and one-tap GPS sharing.",
  },
  company: {
    to: "/company",
    title: "Company",
    icon: LayoutDashboard,
    blurb: "Manage vehicles, routes and trips.",
  },
  staff: {
    to: "/staff",
    title: "Hotel staff",
    icon: Hotel,
    blurb: "Pickup alerts and buses approaching your stop.",
  },
  admin: {
    to: "/admin",
    title: "Admin",
    icon: ShieldCheck,
    blurb: "Fleet health, users, roles and scheduling.",
  },
  mechanic: {
    to: "/mechanic",
    title: "Mechanic",
    icon: Wrench,
    blurb: "Vehicle issues and maintenance chat with drivers.",
  },
  kiosk_bus: {
    to: "/kiosk",
    title: "Bus Entry Kiosk",
    icon: Usb,
    blurb: "NFC badge tap-in board at the vehicle door.",
  },
  kiosk_driver: {
    to: "/driver",
    title: "Driver Kiosk",
    icon: Navigation,
    blurb: "High-accuracy GPS sharing and turn-by-turn nav.",
  },
  kiosk_front_desk: {
    to: "/kiosk",
    title: "Front Desk Sign-In",
    icon: PenLine,
    blurb: "Visitor sign-in with signature capture.",
  },
  reviewer_sandbox: {
    to: "/reviewer-sandbox",
    title: "Reviewer Sandbox",
    icon: FlaskConical,
    blurb: "Simulated live bus demo for review.",
  },
};


export default function Welcome() {
 useFutureAppearance();
 const { user, isAuthenticated } = useAuth();
 const navigate = useNavigate();
 const role = user?.role || "staff";
 useEffect(() => {
  if (isAuthenticated && user) navigate(ROLES[role]?.to || "/staff", {replace:true});
 }, [isAuthenticated,user,role,navigate]);
 if (isAuthenticated && user) return <JourneyLoading label="Opening your app…" />;
 return <div className="tt-welcome min-h-[100dvh]">
  <header className="tt-welcome-header">
   <Link to="/" className="flex items-center gap-2 font-bold text-xl"><Logo /><span>Transit<span className="text-primary">Track</span></span></Link>
   <Button asChild variant="outline" className="rounded-xl"><Link to="/login">Sign in <ChevronRight className="w-4 h-4" /></Link></Button>
  </header>
  <main className="tt-welcome-main">
   <section className="tt-welcome-hero" aria-label="Welcome to TransitTrack">
    <img src="/images/transit-welcome.webp" alt="White shuttle bus on a Caribbean coastal road at dusk" className="tt-welcome-art" fetchPriority="high" />
    <div className="tt-welcome-copy">
     <h1>Your journey,<br /><span className="text-primary">connected.</span></h1>
     <p>Track your bus, choose your pickup and stay connected along the way.</p>
     <div className="tt-welcome-actions">
      <Button asChild className="h-14 rounded-xl text-base"><Link to="/login">Sign in <ChevronRight className="w-5 h-5" /></Link></Button>
      <Button asChild variant="outline" className="h-14 rounded-xl text-base"><Link to="/register">Create an account <ChevronRight className="w-5 h-5" /></Link></Button>
     </div>
    </div>
   </section>
   <section className="tt-welcome-features" aria-label="What you can do">
    {[[Bus,"Live bus updates"],[MapPin,"Easy pickup planning"],[MessageCircle,"Messages on the go"]].map(([Icon,text])=><div key={text}><span><Icon aria-hidden="true" /></span><h2>{text}</h2></div>)}
   </section>
   <div className="tt-welcome-extra">
    <Button asChild variant="ghost"><Link to="/book-taxi"><Car className="w-4 h-4" /> Book a taxi</Link></Button>
    <details>
     <summary>Workspaces and tablet access</summary>
     <div className="tt-welcome-workspaces">
      {Object.entries(ROLES).map(([key,r])=>{const Icon=r.icon;return <Link key={key} to={`/login?returnTo=${encodeURIComponent(r.to)}`}><Icon className="w-5 h-5 text-primary" /><span><strong>{r.title}</strong><small>{r.blurb}</small></span><ChevronRight className="w-4 h-4 shrink-0" /></Link>})}
     </div>
    </details>
   </div>
  </main>
  <footer className="tt-welcome-footer"><span>TransitTrack</span><div className="flex items-center gap-3"><WeatherWidget variant="chip" /><LiveClock className="text-xs" /></div></footer>
 </div>;
}
