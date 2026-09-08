import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Map, MessageSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";

const HIDDEN_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/kiosk/",
  "/reviewer-sandbox",
];

const TABS = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/route-explorer", label: "Map", icon: Map },
  { to: "/notifications", label: "Messages", icon: MessageSquare },
  { to: "/account", label: "Account", icon: User },
];

// Per-tab remembered route stack (session-local)
const tabStacks = {};

function tabFor(pathname) {
  if (pathname === "/") return "/";
  const match = TABS.find((t) => t.to !== "/" && pathname.startsWith(t.to));
  return match ? match.to : null;
}

export default function MobileTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const tab = tabFor(pathname);
    if (tab) tabStacks[tab] = pathname;
  }, [pathname]);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md safe-area-bottom">
      <div className="flex items-stretch justify-around">
        {TABS.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === "/" : pathname.startsWith(to);
          const target = tabStacks[to] || to;
          return (
            <button
              key={to}
              type="button"
              onClick={() => navigate(target)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
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