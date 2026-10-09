import React from "react";
import { Link } from "react-router-dom";
import { Bell, ChevronRight, ExternalLink, KeyRound, LifeBuoy, LogOut, MapPinned, MessageCircle, MessageSquareWarning, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { useSupportWhatsApp } from "@/components/support/ReportAppProblem";
import { whatsappLink } from "@/lib/appSupport";

function Row({ to, icon: Icon, title, sub }) {
  return (
    <li>
      <Link to={to} className="flex min-h-[64px] items-center gap-4 px-6 py-2 hover:bg-accent/50 md:px-4">
        <Icon className="h-[22px] w-[22px] shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {sub && <span className="block truncate text-body-sm text-muted-foreground">{sub}</span>}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

// Opens outside the app (WhatsApp), in a new tab.
function ExternalRow({ href, icon: Icon, title, sub }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-h-[64px] items-center gap-4 px-6 py-2 hover:bg-accent/50 md:px-4">
        <Icon className="h-[22px] w-[22px] shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {sub && <span className="block truncate text-body-sm text-muted-foreground">{sub}</span>}
        </span>
        <ExternalLink className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </a>
    </li>
  );
}

function Group({ title, children }) {
  return (
    <section className="pb-6" aria-label={title}>
      <h2 className="px-6 pb-1 text-body-sm font-semibold text-muted-foreground md:px-0">{title}</h2>
      <ul className="divide-y divide-border border-y border-border md:rounded-xl md:border md:bg-card">{children}</ul>
    </section>
  );
}

// Everything that isn't Home, Map or Buses.
export default function More() {
  const { logout } = useAuth();
  // Shown only once an admin sets the support WhatsApp number in Settings.
  const support = useSupportWhatsApp();
  return (
    <AppLayout variant="passenger" title="More">
      <div className="max-w-2xl">
        <Group title="You">
          <Row to="/account" icon={UserRound} title="Account" sub="Your name, photo and sign-in" />
          <Row to="/staff?sheet=pickup" icon={MapPinned} title="Pickup settings" sub="Find a nearby pickup and review your walk" />
          <Row to="/staff?sheet=notifications" icon={Bell} title="Notifications" sub="Arrival alerts, WhatsApp updates and company settings" />
        </Group>
        <Group title="On the bus">
          <Row to="/staff?sheet=chat" icon={MessageCircle} title="Messages" sub="Chat with your driver and the people on this bus" />
          <Row to="/staff?sheet=badge" icon={KeyRound} title="Bus boarding" sub="Permanent QR, choose or reset your boarding code" />
          <Row to="/staff?sheet=assistant" icon={Sparkles} title="Ask about your bus" sub="Quick answers about times and stops" />
          <Row to="/staff?sheet=help" icon={LifeBuoy} title="Help and lost items" sub="Report something left on the bus" />
          <Row to="/safety-standards" icon={ShieldCheck} title="Safety standards" sub="How your company keeps rides safe" />
          {support && <ExternalRow href={whatsappLink(support, "passenger app")} icon={MessageSquareWarning} title="Report an app problem" sub="WhatsApp the TransitTrack team" />}
        </Group>
        <div className="px-6 md:px-0">
          <button type="button" onClick={() => logout()} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-border font-semibold hover:bg-accent">
            <LogOut className="h-5 w-5" aria-hidden="true" /> Sign out
          </button>
        </div>
      </div>
    </AppLayout>
  );
}