import useFutureAppearance from "@/hooks/useFutureAppearance";
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Bus, ClipboardCheck, LayoutDashboard, LogOut, Map as MapIcon, User, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageSlots } from "@/components/admin/kit";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { accountName, nameInitials } from "@/lib/userName";

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
  { to: "/staff", label: "Home", also: ["/"] },
  { to: "/route-explorer", label: "Map" },
  { to: "/buses", label: "Buses" },
  { to: "/more", label: "More", also: ["/notifications", "/account", "/safety-standards"] },
];
const STAFF_ROLES = new Set(["admin", "driver", "company", "mechanic"]);

// Passenger screens: no header on phones (the bottom tabs are the navigation
// and each screen has its own top line); a slim top bar with the same tabs
// from tablet width up.
function PassengerLayout({ children, title, fullBleed = false, back = null }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  useFutureAppearance(!STAFF_ROLES.has(user?.role));
  if (STAFF_ROLES.has(user?.role)) return <FullLayout title={title}>{children}</FullLayout>;
  const initials = nameInitials(user);

  return (
    <div className="tt-app-shell min-h-screen bg-background">
      <header className="sticky top-0 z-40 hidden border-b border-border bg-background/90 backdrop-blur-md md:block">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-8">
          <Link to="/staff" className="flex items-center gap-2.5 font-heading text-title-sm font-bold">
            <Logo className="h-8 w-8" />
            <span>Transit<span className="text-primary">Track</span></span>
          </Link>
          <nav className="flex h-full items-stretch gap-1" aria-label="Main">
            {PASSENGER_NAV.map(({ to, label, also = [] }) => {
              const active = pathname.startsWith(to) || also.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
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
              <span className="max-w-[180px] truncate text-body-sm font-semibold">{accountName(user) || "Account"}</span>
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
        {back && (
          <Link to={back.to} className="ml-4 mt-3 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-body font-semibold text-muted-foreground hover:text-foreground md:ml-0">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" /> {back.label}
          </Link>
        )}
        {title && <h1 className={cn("px-6 pb-2 text-display font-bold md:px-0", back ? "pt-1" : "pt-6 md:pt-2")}>{title}</h1>}
        {children}
      </main>
    </div>
  );
}

// Each staff role's own sections, shown across the top bar on wide screens
// and as bottom tabs on phones.
const ROLE_NAV = {
  mechanic: [
    { to: "/mechanic", label: "Dashboard", icon: LayoutDashboard },
    { to: "/run-inspection", label: "Inspect", icon: ClipboardCheck },
    { to: "/account", label: "Account", icon: User },
  ],
  company: [
    { to: "/company", label: "Dashboard", icon: LayoutDashboard },
    { to: "/manager", label: "Fleet", icon: MapIcon },
    { to: "/staff-directory", label: "Passengers", icon: Users },
    { to: "/account", label: "Account", icon: User },
  ],
  admin: [
    { to: "/admin", label: "Admin", icon: LayoutDashboard },
    { to: "/account", label: "Account", icon: User },
  ],
  driver: [
    { to: "/driver", label: "Driver app", icon: Bus },
    { to: "/account", label: "Account", icon: User },
  ],
};
const ROLE_LABEL = { mechanic: "Mechanic", company: "Company operator", admin: "Administrator", driver: "Driver" };
const ROLE_HOME = { mechanic: "/mechanic", company: "/company", admin: "/admin", driver: "/driver" };

function FullLayout({ children, title }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [actionsEl, setActionsEl] = React.useState(null);
  const [introEl, setIntroEl] = React.useState(null);
  const slots = React.useMemo(() => ({ actions: actionsEl, intro: introEl }), [actionsEl, introEl]);
  const nav = ROLE_NAV[user?.role] || [];
  const isActive = (to) => pathname === to || pathname.startsWith(to + "/");
  const onTopLevel = pathname === "/" || nav.some((n) => n.to === pathname) || ["/admin", "/staff", "/driver", "/notifications", "/account", "/route-explorer"].includes(pathname);
  const initials = nameInitials(user);

  return (
    <div className="tt-app-shell min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur safe-area-top">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 safe-area-x sm:px-6">
          {!onTopLevel && (
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => navigate(-1)} aria-label="Go back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Link to={ROLE_HOME[user?.role] || "/"} className="mr-4 flex items-center gap-2.5 font-heading text-title-sm font-bold">
            <Logo className="h-8 w-8" />
            <span className="hidden sm:inline">Transit<span className="text-primary">Track</span></span>
          </Link>
          {nav.length > 0 && (
            <nav className="hidden h-full items-stretch gap-1 md:flex" aria-label="Main">
              {nav.filter((n) => n.to !== "/account").map(({ to, label }) => {
                const on = isActive(to);
                return (
                  <Link key={to} to={to} aria-current={on ? "page" : undefined}
                    className={cn("relative flex items-center px-3 text-body-sm font-semibold transition-colors", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {label}
                    {on && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-primary" aria-hidden="true" />}
                  </Link>
                );
              })}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 hover:bg-accent md:pr-3" aria-label="Account menu">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-body-sm font-bold" aria-hidden="true">{initials}</span>
                    <span className="hidden min-w-0 text-left md:block">
                      <span className="block max-w-[180px] truncate text-body-sm font-semibold">{accountName(user)}</span>
                      <span className="block text-caption text-muted-foreground">{ROLE_LABEL[user.role] || "Signed in"}</span>
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link to="/account"><User className="mr-2 h-4 w-4" /> My account</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => logout()}><LogOut className="mr-2 h-4 w-4" /> Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm"><Link to="/login">Sign in</Link></Button>
            )}
          </div>
        </div>
      </header>
      <main className={cn("mx-auto max-w-7xl px-4 pt-6 sm:px-6", nav.length ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-12" : "pb-12")}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 empty:hidden">
          {title && (
            <div className="min-w-0">
              <h1 className="text-headline font-bold">{title}</h1>
              <div ref={setIntroEl} />
            </div>
          )}
          <div ref={setActionsEl} className="empty:hidden" />
        </div>
        <PageSlots.Provider value={title ? slots : { actions: actionsEl, intro: null }}>{children}</PageSlots.Provider>
      </main>
      {nav.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main">
          <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
            {nav.map(({ to, label, icon: Icon }) => {
              const on = isActive(to);
              return (
                <Link key={to} to={to} aria-current={on ? "page" : undefined}
                  className={cn("relative flex flex-col items-center justify-center gap-1 text-caption font-semibold", on ? "text-foreground" : "text-muted-foreground")}>
                  {on && <span className="absolute inset-x-6 top-0 h-[3px] rounded-b bg-primary" aria-hidden="true" />}
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}