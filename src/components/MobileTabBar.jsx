import React, { useEffect } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { Home, Map, MessageSquare, User } from "lucide-react";
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
  // The passenger home lives at /staff ("/" sends each role to its own home).
  { to: "/", label: "Home", icon: Home, exact: true, also: "/staff" },
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
  if (pathname === "/" || pathname.startsWith("/staff")) return "/";
  const match = TABS.find((t) => t.to !== "/" && pathname.startsWith(t.to));
  return match ? match.to : null;
}

export default function MobileTabBar() {
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
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md safe-area-bottom" aria-label="Main">
      <div className="flex items-stretch justify-around">
        {TABS.map(({ to, label, icon: Icon, exact, also }) => {
          const active = exact ? pathname === to || (also && pathname.startsWith(also)) : pathname.startsWith(to);
          return (
            <button
              key={to}
              type="button"
              onClick={() => goToTab(to, active)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 pb-2 pt-2.5 text-caption font-semibold transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && <span className="absolute left-1/2 top-0 h-[3px] w-10 -translate-x-1/2 rounded-b-full bg-primary" aria-hidden="true" />}
              <Icon key={active ? "on" : "off"} className={cn("h-6 w-6", active && "tt-pop")} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
