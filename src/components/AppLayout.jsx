import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

// Set by the admin area when it shows a full page (Vehicle logs, Location
// timeline…) inside its own sidebar — the page then skips its own header so
// there aren't two top bars.
export const EmbeddedLayout = React.createContext(false);

export default function AppLayout(props) {
  const embedded = React.useContext(EmbeddedLayout);
  if (embedded) {
    // The admin sidebar already shows the page name as its heading.
    return <div>{props.children}</div>;
  }
  if (props.variant === "passenger") return <PassengerLayout {...props} />;
  return <FullLayout {...props} />;
}

const PASSENGER_NAV = [
  { to: "/staff", label: "Home", also: "/" },
  { to: "/route-explorer", label: "Map" },
  { to: "/notifications", label: "Messages" },
];
const STAFF_ROLES = new Set(["admin", "driver", "company", "mechanic"]);

// Passenger screens: no header on phones (the bottom tabs are the navigation
// and each screen has its own top line); a slim top bar with the same tabs
// from tablet width up.
function PassengerLayout({ children, title, fullBleed = false }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  if (STAFF_ROLES.has(user?.role)) return <FullLayout title={title}>{children}</FullLayout>;
  const initials = (user?.full_name || user?.email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 hidden border-b border-border bg-background/90 backdrop-blur-md md:block">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-8">
          <Link to="/staff" className="flex items-center gap-2.5 font-heading text-title-sm font-bold">
            <Logo className="h-8 w-8" />
            TransitTrack
          </Link>
          <nav className="flex h-full items-stretch gap-1" aria-label="Main">
            {PASSENGER_NAV.map(({ to, label, also }) => {
              const active = pathname.startsWith(to) || pathname === also;
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center px-3 text-body font-semibold transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                  {active && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-primary" aria-hidden="true" />}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/account" className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 hover:bg-accent" aria-label="My account">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-body-sm font-bold" aria-hidden="true">{initials}</span>
              <span className="max-w-[180px] truncate text-body-sm font-semibold">{user?.full_name || user?.email || "Account"}</span>
            </Link>
            <Button variant="ghost" size="icon" onClick={() => logout()} aria-label="Sign out" title="Sign out">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>
      <main
        className={cn(
          "mx-auto max-w-6xl pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] md:px-8 md:pb-12 md:pt-6",
          fullBleed && "max-w-none p-0 md:p-0 md:pb-0",
        )}
      >
        {title && <h1 className="px-6 pb-2 pt-6 text-display font-bold md:px-0 md:pt-2">{title}</h1>}
        {children}
      </main>
    </div>
  );
}

function FullLayout({ children, title }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isHome = pathname === "/";
  const hideBack = isHome || ["/admin", "/staff", "/driver", "/notifications", "/account", "/route-explorer"].includes(pathname);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-[12px] safe-area-top">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between safe-area-x">
          <div className="flex items-center gap-1">
            {!hideBack && (
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => navigate(-1)} aria-label="Go back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <Link to="/" className="flex items-center gap-2.5 font-heading font-semibold">
              <Logo className="w-8 h-8" />
              <span className="hidden sm:inline">TransitTrack</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <span className="hidden md:block text-sm text-muted-foreground max-w-[220px] truncate">
                {user.full_name || user.email}
              </span>
            )}
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link to="/account">
                <User className="w-4 h-4" />
                <span className="hidden sm:inline ml-1.5">My account</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => logout()}>
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline ml-1.5">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      {/* mobile bottom padding clears the fixed MobileTabBar (h-14 + labels ≈ 4rem) plus the safe-area inset;
          the .safe-area-bottom utility class is intentionally omitted here since it would only ever set
          padding-bottom to the safe-area inset alone and, being defined after Tailwind's utilities in
          index.css, would win the cascade and wipe out the tab-bar clearance below */}
      <main className="max-w-7xl mx-auto px-4 pt-6 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-6">
        {title && <h1 className="text-2xl font-heading font-semibold mb-4">{title}</h1>}
        {children}
      </main>
    </div>
  );
}