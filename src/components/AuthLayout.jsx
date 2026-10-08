import React from "react";
import { Link } from "react-router-dom";
import { Bus, MapPin, MessageCircle } from "lucide-react";
import Logo from "@/components/Logo";
import useFutureAppearance from "@/hooks/useFutureAppearance";

const POINTS = [[Bus,"Live bus updates"],[MapPin,"Easy pickup planning"],[MessageCircle,"Messages on the go"]];
export default function AuthLayout({ title, subtitle, footer, children }) {
 useFutureAppearance();
 return <div className="tt-auth-layout min-h-[100dvh]">
  <aside className="tt-auth-brand-panel">
   <Link to="/" className="tt-auth-logo"><Logo className="w-10 h-10" /><span>Transit<span className="text-primary">Track</span></span></Link>
   <img src="/images/transit-welcome.webp" alt="" className="tt-auth-art" />
   <div className="tt-auth-brand-copy"><h2>Your journey,<br /><span className="text-primary">connected.</span></h2><p>Track your bus, choose your pickup and stay connected along the way.</p>
    <ul>{POINTS.map(([Icon,text])=><li key={text}><Icon className="w-5 h-5 text-primary" aria-hidden="true" />{text}</li>)}</ul>
   </div>
  </aside>
  <main className="tt-auth-form-area safe-area-top safe-area-bottom">
   <div className="w-full max-w-md">
    <div className="tt-auth-mobile-hero">
     <Link to="/" className="tt-auth-logo"><Logo className="w-9 h-9" /><span>Transit<span className="text-primary">Track</span></span></Link>
     <img src="/images/transit-welcome.webp" alt="" />
    </div>
    <div className="mb-6"><h1 className="text-headline font-bold tracking-tight">{title}</h1>{subtitle && <p className="mt-2 text-body text-muted-foreground">{subtitle}</p>}</div>
    <div className="tt-auth-form-card rounded-2xl border border-border bg-card p-5 sm:p-7">{children}</div>
    {footer && <div className="mt-6 text-center text-body-sm text-muted-foreground">{footer}</div>}
   </div>
  </main>
 </div>;
}
