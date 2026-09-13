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
              <Icon className="w-5 h-5" />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
