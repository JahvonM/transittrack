import React from "react";
import { Link } from "react-router-dom";
import { Box, Clock, WifiOff } from "lucide-react";
import Logo from "@/components/Logo";
import AnimatedBus from "@/components/AnimatedBus";

const POINTS = [
  { icon: Box, text: "Every bus live on a 3D map" },
  { icon: Clock, text: "Arrival times learned from your own buses" },
  { icon: WifiOff, text: "Keeps working on tablets when the signal drops" },
];

// Sign in, sign up and password screens: the form on the right, and on wide
// screens a brand panel on the left.
export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-12" aria-hidden="true">
        <Link to="/" tabIndex={-1} className="flex items-center gap-3 font-heading text-title font-bold text-sidebar-foreground">
          <Logo className="h-10 w-10" />
          <span>Transit<span className="text-sidebar-primary">Track</span></span>
        </Link>
        <div className="max-w-md">
          <p className="font-display text-[2.75rem] font-semibold leading-[1.05] text-sidebar-foreground">Know where every bus is, and when it gets there.</p>
          <ul className="mt-8 space-y-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-body text-sidebar-foreground/80">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sidebar-accent text-sidebar-foreground"><Icon className="h-4 w-4" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative -mx-12 -mb-12 h-40" style={{ background: "radial-gradient(70% 100% at 50% 100%, hsl(var(--primary) / 0.16), transparent 70%)" }}>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2"><AnimatedBus mode="arrive" width={260} /></div>
          <div className="absolute inset-x-0 bottom-5 h-px bg-sidebar-border" />
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 safe-area-top safe-area-bottom sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <Link to="/" className="mb-6 inline-flex items-center gap-2.5 font-heading text-title-sm font-bold lg:hidden">
              <Logo className="h-10 w-10" />
              <span>Transit<span className="text-primary">Track</span></span>
            </Link>
            <h1 className="text-headline font-bold tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="mt-2 text-body text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">{children}</div>
          {footer && <p className="mt-6 text-center text-body-sm text-muted-foreground lg:text-left">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
