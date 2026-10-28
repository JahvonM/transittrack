import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarPlus, Bus, Contact, LayoutDashboard, LogOut, MapPin, Menu, Route as RouteIcon, Settings, User } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Logo from "@/components/Logo";
import LiveClock from "@/components/LiveClock";
import { PageSlots } from "@/components/admin/kit";
import { useAuth } from "@/lib/AuthContext";
import useFutureAppearance from "@/hooks/useFutureAppearance";
import { accountName, nameInitials } from "@/lib/userName";
import { cn } from "@/lib/utils";

// The company portal's chrome: the same sidebar, top bar, colours and
// light/dark look as Admin, with the company's own sections.
export const COMPANY_NAV = [
  { to: "/company", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/company/jobs", label: "Jobs", icon: CalendarPlus },
  { to: "/manager", label: "Live map", icon: MapPin },
  { to: "/company/vehicles", label: "Buses", icon: Bus },
  { to: "/company/routes", label: "Routes", icon: RouteIcon },
  { to: "/staff-directory", label: "Passengers", icon: Contact },
];
const PROFILE = { to: "/company/profile", label: "Company profile", icon: User };

function isOn(item, pathname) {
  if (item.exact) return pathname === item.to || pathname === `${item.to}/` || pathname === `${item.to}/overview`;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function NavLink({ item, pathname, onNavigate }) {
  const Icon = item.icon;
  const on = isOn(item, pathname);
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={on ? "page" : undefined}
      className={cn(
        "relative flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-body-sm font-medium transition-colors",
        on ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {on && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-sidebar-primary" aria-hidden="true" />}
      <Icon className={cn("h-[18px] w-[18px] shrink-0", on && "text-sidebar-primary")} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function AccountPicture({ user, initials }) {
  const photo = typeof user?.photo_url === "string" ? user.photo_url : "";
  const [failed, setFailed] = useState("");
  return photo && failed !== photo
    ? <img src={photo} alt="" className="h-full w-full object-cover" onError={() => setFailed(photo)} />
    : initials;
}

const today = () => new Date().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export default function CompanyShell({ title, subtitle, children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [actionsEl, setActionsEl] = useState(null);
  const [introEl, setIntroEl] = useState(null);
  const slots = useMemo(() => ({ actions: actionsEl, intro: introEl }), [actionsEl, introEl]);
  useFutureAppearance(true, "tt-admin-app");
  const initials = nameInitials(user) || "C";
  const current = [...COMPANY_NAV, PROFILE].find((item) => isOn(item, pathname));
  const close = () => setOpen(false);

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to="/company" onClick={close} className="flex h-16 shrink-0 items-center gap-2.5 px-5 font-heading text-title-sm font-bold text-sidebar-foreground">
        <Logo className="h-8 w-8" />
        <span>McSween <span className="text-sidebar-primary">Transport</span></span>
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <nav aria-label="Company" className="space-y-1">
          {COMPANY_NAV.map((item) => <NavLink key={item.to} item={item} pathname={pathname} onNavigate={close} />)}
          <div className="tt-admin-nav-secondary space-y-1">
            <NavLink item={PROFILE} pathname={pathname} onNavigate={close} />
            <NavLink item={{ to: "/account", label: "Account and appearance", icon: Settings }} pathname={pathname} onNavigate={close} />
          </div>
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-sidebar-border px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-sidebar-primary text-body-sm font-bold text-sidebar-primary-foreground" aria-hidden="true"><AccountPicture user={user} initials={initials} /></span>
        <span className="min-w-0">
          <span className="block truncate text-body-sm font-semibold text-sidebar-foreground">{accountName(user) || "Company"}</span>
          <span className="block text-caption text-sidebar-foreground/60">Company portal</span>
        </span>
      </div>
    </div>
  );

  return (
    <div className="tt-admin-shell tt-company-shell flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">{sidebar}</aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Company menu</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex min-h-[4rem] shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
          <span className="truncate text-body-sm text-muted-foreground">Company <span className="mx-2">/</span> {current?.label || title || "Overview"}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <p className="hidden whitespace-nowrap text-body-sm text-muted-foreground md:block">
              {today()} <LiveClock seconds={false} mono={false} className="ml-1 font-semibold text-foreground" />
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-secondary text-body-sm font-bold hover:ring-2 hover:ring-ring" aria-label="Account menu"><AccountPicture user={user} initials={initials} /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user?.email || "Company"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/company/profile"><User className="mr-2 h-4 w-4" /> Company profile</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/account"><Settings className="mr-2 h-4 w-4" /> Account and appearance</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => logout()}><LogOut className="mr-2 h-4 w-4" /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <h1 className="text-headline font-bold">{title || current?.label || "Company"}</h1>
              {subtitle && <p className="mt-1 text-body-sm text-muted-foreground">{subtitle}</p>}
              <div ref={setIntroEl} />
            </div>
            <div ref={setActionsEl} className="empty:hidden" />
          </div>
          <PageSlots.Provider value={slots}>{children}</PageSlots.Provider>
        </main>
      </div>
    </div>
  );
}
