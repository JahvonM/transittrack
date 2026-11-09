import React from "react";
import { Link } from "react-router-dom";
import { Car, ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isSiteHost } from "@/lib/bookingSite";

// Booking lives on the public website, which signed-out visitors can reach.
const bookHref = () => (typeof window !== "undefined" && isSiteHost(window.location.hostname) ? "/book" : "/site/book");

export default function WelcomeHero() {
  return (
    <section className="tt-welcome-hero" aria-label="Welcome to McSween Transport">
      <img src="/images/transit-welcome.webp" alt="White shuttle bus on a Caribbean coastal road at dusk" className="tt-welcome-art" fetchPriority="high" />
      <div className="tt-welcome-copy">
        <p className="tt-welcome-kicker">Staff transfers · Airport pickups · Taxi service</p>
        <h1>Your journey,<br /><span className="text-primary">Connected.</span></h1>
        <p className="tt-welcome-lead">Track your bus, choose your pickup and stay connected along the way.</p>
        <div className="tt-welcome-actions">
          <Button asChild className="h-14 rounded-xl text-base"><Link to="/login">Sign in <ChevronRight className="w-5 h-5" /></Link></Button>
          <Button asChild variant="outline" className="h-14 rounded-xl text-base"><a href={bookHref()}><Car className="w-5 h-5" /> Book a taxi</a></Button>
          <Button asChild variant="outline" className="h-14 rounded-xl text-base"><Link to="/track"><MapPin className="w-5 h-5" /> Track a ride</Link></Button>
        </div>
        <p className="tt-welcome-note">Drivers and crew sign in with a code — no email account needed.</p>
      </div>
    </section>
  );
}