import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { Home, Map, MessageSquare, User, Bus, Menu, LifeBuoy } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const HIDDEN_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/kiosk",
  "/reviewer-sandbox",
  "/driver",
  "/admin",
];

const TABS = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/route-explorer", label: "Map", icon: Map },
  { to: "/notifications", label: "Messages", icon: MessageSquare },
  { to: "/account", label: "Account", icon: User },
];

// Per-tab remembered navigation stack (session-local): each tab keeps the
// list of routes visited inside it, most recent last. Forward navigation
// pushes; browser/back navigation pops back to wherever the user actually
// landed, so returning to a tab resumes exactly where it was left instead of
// just the single last-known route.
const tabStacks = {};

function tabFor(pathname) {
  if (pathname === "/") return "/";
  const match = TABS.find((t) => t.to !== "/" && pathname.startsWith(t.to));
  return match ? match.to : null;
}

export default function MobileTabBar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigationType = useNavigationType(); // "PUSH" | "POP" | "REPLACE"
  const navigate = useNavigate();

  useEffect(() => {
    const tab = tabFor(pathname);
    if (!tab) return;
    const stack = tabStacks[tab] || (tabStacks[tab] = []);
    if (navigationType === "POP") {
      // Back navigation: sync the stack to wherever we actually landed,
      // popping anything ahead of it rather than blindly pushing.
      const idx = stack.lastIndexOf(pathname);
      if (idx !== -1) stack.length = idx + 1;
      else stack.push(pathname);
    } else if (stack[stack.length - 1] !== pathname) {
      stack.push(pathname);
    }
  }, [pathname, navigationType]);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  if (["staff","passenger"].includes(user?.role)) return <PassengerTabs />;

  const goToTab = (to, active) => {
    if (active) {
      // Re-selecting the active tab resets it back to its root.
      tabStacks[to] = [to];
      navigate(to);
      return;
    }
    const stack = tabStacks[to];
    navigate((stack && stack[stack.length - 1]) || to);
  };

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md safe-area-bottom">
      <div className="flex items-stretch justify-around">
        {TABS.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === "/" : pathname.startsWith(to);
          return (
            <button
              key={to}
              type="button"
              onClick={() => goToTab(to, active)}
              className={cn(
                "flex flex-1 min-h-[44px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon key={active ? "on" : "off"} className={cn("w-5 h-5", active && "tt-pop")} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function PassengerTabs() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const [more, setMore] = useState(false);
  const tabs = [{label:"Home",icon:Home,to:"/staff",active:pathname === "/staff" && !hash}, {label:"Map",icon:Map,to:"/route-explorer",active:pathname === "/route-explorer"}, {label:"Buses",icon:Bus,to:"/staff#passenger-buses",active:pathname === "/staff" && !!hash}, {label:"More",icon:Menu,active:more || ["/account","/notifications","/support"].includes(pathname)}];
  return <><nav aria-label="Passenger sections" className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md safe-area-bottom"><div className="flex items-stretch">{tabs.map(({label,icon:Icon,to,active}) => <button key={label} type="button" aria-current={active ? "page" : undefined} onClick={() => to ? navigate(to) : setMore(true)} className={`flex-1 min-h-[60px] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}><Icon className="w-5 h-5" />{label}</button>)}</div></nav>
    <Sheet open={more} onOpenChange={setMore}><SheetContent side="bottom" className="rounded-t-3xl"><SheetTitle>More</SheetTitle><div className="grid gap-2 py-4">{[{label:"Messages",to:"/notifications",icon:MessageSquare},{label:"My account",to:"/account",icon:User},{label:"Passenger support",to:"/support",icon:LifeBuoy}].map(({label,to,icon:Icon}) => <button key={to} onClick={() => { setMore(false); navigate(to); }} className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left"><Icon className="w-5 h-5 text-primary" />{label}</button>)}</div></SheetContent></Sheet></>;
}
