import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { accountName, nameInitials } from "@/lib/userName";
import {
  Activity,
  Bus,
  Building2,
  CalendarPlus,
  Car,
  Wrench,
  Image as ImageIcon,
  LayoutDashboard,
  MapPin,
  Megaphone,
  Menu,
  BellRing,
  Bug,
  User,
  Users,
  Smartphone,
  ClipboardList,
  Database,
  Siren,
  AlertTriangle,
  Package,
  CalendarClock,
  ListChecks,
  Calendar,
  History,
  ChevronDown,
  Search,
  Bell,
  LogOut,
  Settings,
  Timer,
  ScrollText,
  PackageSearch,
  CreditCard,
  FileText,
  Gauge,
  LineChart,
  BarChart3,
  Map as MapIcon,
  Route,
  Contact,
  ShieldCheck,
  LifeBuoy,
  BookOpen,
  Hourglass,
  ClipboardCheck,
  Tv,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Logo from "@/components/Logo";
import LiveClock from "@/components/LiveClock";
import { cn } from "@/lib/utils";
import { PageSlots } from "@/components/admin/kit";
import { ADMIN_HUBS, ADMIN_MENU, carriedSearch, groupOf, hubOf, hubTarget, menuHome, rememberTab } from "@/lib/adminMenu";

// Every admin section, for its label, its icon and the search box. Where each
// one sits in the sidebar (alone, as a tab of a hub, or in a folding group) is
// in lib/adminMenu.js.
export const ADMIN_SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },

  { id: "trips", label: "Jobs", icon: CalendarPlus },
  { id: "fleet-workspace", label: "Fleet workspace", icon: LayoutDashboard },
  { id: "office-displays", label: "Office displays", icon: Tv },
  { id: "fleet", label: "Live fleet", icon: MapPin },
  { id: "vehicles", label: "Vehicles", icon: Bus },
  { id: "drivers", label: "Drivers", icon: Car },
  { id: "health", label: "Fleet health", icon: Activity },
  { id: "kiosks", label: "Kiosk tablets", icon: Smartphone },
  { id: "shifts", label: "Driver shifts", icon: Timer },
  { id: "cards", label: "Card issuing", icon: CreditCard },
  { id: "card-designs", label: "Card designer", icon: ImageIcon },

  // Full pages shown inside the admin area (see ADMIN_PAGES in Admin.jsx).
  { id: "vehicle-logs", label: "Vehicle log", icon: FileText },
  { id: "driving-reports", label: "Driver report", icon: Gauge },
  { id: "route-analytics", label: "Route analysis", icon: LineChart },
  { id: "fleet-analytics", label: "Fleet analysis", icon: BarChart3 },
  { id: "route-planner", label: "Route planner", icon: MapIcon },
  { id: "route-explorer", label: "Route explorer", icon: Route },
  { id: "plan-pickups", label: "Plan pickups", icon: Users },
  { id: "travel-times", label: "Travel times", icon: Hourglass },

  { id: "service", label: "Service Queue", icon: Wrench },
  { id: "faults", label: "Faults", icon: AlertTriangle },
  { id: "parts", label: "Parts", icon: Package },
  { id: "schedule", label: "Maintenance Schedule", icon: CalendarClock },
  { id: "calendar", label: "Maintenance Calendar", icon: Calendar },
  { id: "templates", label: "Inspection Templates", icon: ListChecks },
  { id: "inspection-history", label: "Inspection History", icon: History },
  { id: "service-history", label: "Service history", icon: History },
  { id: "incident-reports", label: "Incident reports", icon: AlertTriangle },
  { id: "safety-standards", label: "Safety standards", icon: ShieldCheck },

  { id: "directory", label: "Passengers", icon: Contact },
  { id: "signup-day", label: "Sign-up day", icon: ClipboardCheck },
  { id: "checkins", label: "Sign-in log", icon: ClipboardList },
  { id: "billing", label: "Completed & billing", icon: Building2 },
  { id: "messaging", label: "Messaging", icon: Megaphone },
  { id: "lost-items", label: "Lost items", icon: PackageSearch },
  { id: "ads", label: "Advertisements", icon: ImageIcon },
  { id: "ride-history", label: "Ride history", icon: History },
  { id: "passenger-bookings", label: "Passenger bookings", icon: BookOpen },
  { id: "support", label: "Passenger support", icon: LifeBuoy },

  { id: "users", label: "Users & roles", icon: Users },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "notifications", label: "Notifications", icon: BellRing },
  { id: "app-errors", label: "App errors", icon: Bug },
  { id: "audit", label: "Change history", icon: ScrollText },
  { id: "data", label: "Data manager", icon: Database },

  { id: "profile", label: "My profile", icon: User },
];

// Sidebar names that differ from the section's own name.
const PRIMARY = [
 {id:"overview",label:"Overview",icon:LayoutDashboard},
 {id:"profile",label:"Settings",icon:Settings},
];
const HUB_ICONS = { "vehicles-drivers": Bus, routes: Route };
const GROUP_ICONS = { Maintenance: Wrench, Operations: Activity, Reports: BarChart3, "All tools": Database };
const sectionItem = (id) => PRIMARY.find((p) => p.id === id) || ADMIN_SECTIONS.find((s) => s.id === id);

function NavItem({ item, active, onNavigate, current = active === item.id, target = item.id }) {
  const Icon = item.icon;
  const on = current;
  return (
    <button
      type="button"
      onClick={() => onNavigate(target)}
      aria-current={on ? "page" : undefined}
      className={cn(
        "relative flex min-h-[40px] w-full items-center gap-3 rounded-lg px-3 text-left text-body-sm font-medium transition-colors",
        on ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {on && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-sidebar-primary" aria-hidden="true" />}
      <Icon className={cn("h-[18px] w-[18px] shrink-0", on && "text-sidebar-primary")} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

// The sidebar, laid out by lib/adminMenu.js: the everyday screens at the top
// (each hub is one link), then folding groups for the rest.
function SidebarNav({ active: section, onNavigate }) {
 // Card issuing, card design and the sign-in log open on the Passengers page;
 // Fleet workspace and Fleet health open on Live fleet.
 const active=menuHome(section);
 const activeGroup=groupOf(active);
 const activeHub=hubOf(active)?.id;
 const [openGroups,setOpenGroups]=useState(()=>activeGroup?{[activeGroup]:true}:{});
 useEffect(()=>{if(activeGroup)setOpenGroups(g=>({...g,[activeGroup]:true}));},[activeGroup]);
 const entry=(e)=>{
  if(typeof e==="string")return <NavItem key={e} item={sectionItem(e)} active={active} onNavigate={onNavigate} />;
  if(e.hub){
   const hub=ADMIN_HUBS.find(h=>h.id===e.hub);
   return <NavItem key={hub.id} item={{id:hub.id,label:hub.label,icon:HUB_ICONS[hub.id]}} current={activeHub===hub.id} target={hubTarget(hub.id)} onNavigate={onNavigate} />;
  }
  const Icon=GROUP_ICONS[e.group]||Database,expanded=!!openGroups[e.group];
  return <div key={e.group} className="tt-admin-nav-group">
   <button type="button" aria-expanded={expanded} onClick={()=>setOpenGroups(v=>({...v,[e.group]:!v[e.group]}))} className={cn("tt-admin-group-toggle",activeGroup===e.group && "tt-admin-group-current")}>
    <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /><span>{e.group}</span><ChevronDown className={cn("w-4 h-4 transition-transform",!expanded && "-rotate-90")} aria-hidden="true" />
   </button>
   {expanded && <div className="tt-admin-group-items space-y-1">{e.ids.map(id=><NavItem key={id} item={sectionItem(id)} active={active} onNavigate={onNavigate} />)}</div>}
  </div>;
 };
 const split=ADMIN_MENU.indexOf("divider");
 return <nav aria-label="Admin" className="tt-admin-nav space-y-1">
  {ADMIN_MENU.slice(0,split).map(entry)}
  <div className="tt-admin-nav-secondary space-y-1">{ADMIN_MENU.slice(split+1).map(entry)}</div>
 </nav>;
}

// A hub's tabs, under its page title. Each tab is a link to its own address,
// keeping the bus, driver, route or person picked here (see carry).
// On a phone the row scrolls sideways and starts at the open tab.
function HubTabs({ hub, active }) {
  const row = useRef(null);
  const { search } = useLocation();
  useEffect(() => {
    const el = row.current;
    const on = el?.querySelector('[aria-current="page"]');
    if (!el || !on) return;
    const left = on.offsetLeft - el.offsetLeft;
    if (left < el.scrollLeft || left + on.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = Math.max(0, left - 16);
  }, [active]);
  return (
    <nav ref={row} aria-label={hub.label + " tabs"} className="tt-admin-hub-tabs min-w-0 max-w-full overflow-x-auto">
      <div className="inline-flex gap-1 rounded-xl bg-secondary p-1">
        {hub.tabs.map((t) => {
          const Icon = ADMIN_SECTIONS.find((s) => s.id === t.id)?.icon;
          const on = t.id === active;
          return (
            <Link
              key={t.id}
              to={"/admin/" + t.id + carriedSearch(t.id, search)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-body-sm font-semibold transition-colors",
                on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Finds any admin section by name, from the top bar.
function SectionSearch({ onNavigate }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  // Every section, then each hub by its own name ("Live fleet", "Routes").
  const all = useMemo(() => {
    const seen = new Set();
    const hubs = ADMIN_HUBS.map((h) => ({ key: "hub:" + h.id, id: h.tabs[0].id, hub: h.id, label: h.label, icon: HUB_ICONS[h.id] }));
    return [...PRIMARY, ...ADMIN_SECTIONS, ...hubs].filter((s) => {
      const keys = [s.key || s.id, "label:" + s.label.toLowerCase()];
      if (keys.some((k) => seen.has(k))) return false;
      keys.forEach((k) => seen.add(k));
      return true;
    });
  }, []);
  const needle = q.trim().toLowerCase();
  const results = needle ? all.filter((s) => s.label.toLowerCase().includes(needle) || s.id.includes(needle)).slice(0, 8) : [];
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const go = (r) => { onNavigate(r.hub ? hubTarget(r.hub) : r.id); setQ(""); setOpen(false); };
  return (
    <div ref={box} className="relative min-w-0 flex-1 sm:max-w-md">
      <label className="flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Search admin</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && results[0]) go(results[0]); if (e.key === "Escape") setOpen(false); }}
          placeholder="Search admin tools, e.g. faults"
          className="h-full min-w-0 flex-1 bg-transparent text-body-sm outline-none placeholder:text-muted-foreground"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="tt-admin-search-results"
          aria-autocomplete="list"
        />
      </label>
      {open && results.length > 0 && (
        <ul id="tt-admin-search-results" role="listbox" className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-xl">
          {results.map((r) => {
            const Icon = r.icon;
            return (
              <li key={r.key || r.id} role="option" aria-selected={false}>
                <button type="button" onClick={() => go(r)} className="flex min-h-[40px] w-full items-center gap-3 rounded-lg px-3 text-left text-body-sm hover:bg-accent">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {r.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const fmtDate = () => new Date().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/**
 * Admin chrome: a full-height sidebar (everyday screens, then folding groups), a
 * top bar with section search, date and time, notifications and the
 * account menu, and the SOS banner above the page.
 */
// The signed-in person's photo, or their initials when there is none or it
// doesn't load.
function AccountPicture({ user, initials }) {
  const photo = typeof user?.photo_url === "string" ? user.photo_url : "";
  const [failed, setFailed] = useState("");
  return photo && failed !== photo
    ? <img src={photo} alt="" className="h-full w-full object-cover" onError={() => setFailed(photo)} />
    : initials;
}

export default function AdminShell({ active, onNavigate, children, alertVehicles = [], user, onSignOut, pushPermission, onEnableNotifications, headerActions = null }) {
  const [open, setOpen] = useState(false);
  const [actionsEl, setActionsEl] = useState(null);
  const [introEl, setIntroEl] = useState(null);
  const slots = useMemo(() => ({ actions: actionsEl, intro: introEl }), [actionsEl, introEl]);
  const nav = (id) => { onNavigate(id); setOpen(false); };
  const current = ADMIN_SECTIONS.find((s) => s.id === menuHome(active));
  const hub = hubOf(active);
  // So the hub's sidebar link comes back to this tab (kept while the console is open).
  rememberTab(active);
  const title = active === "overview" ? "Fleet overview" : hub?.label || PRIMARY.find((p) => p.id === active)?.label || current?.label || "Admin";
  const initials = nameInitials(user) || "A";

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to="/admin" className="flex h-16 shrink-0 items-center gap-2.5 px-5 font-heading text-title-sm font-bold text-sidebar-foreground">
        <Logo className="h-8 w-8" />
        <span>McSween <span className="text-sidebar-primary">Transport</span></span>
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <SidebarNav active={active} onNavigate={nav} />
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-sidebar-border px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-sidebar-primary text-body-sm font-bold text-sidebar-primary-foreground" aria-hidden="true"><AccountPicture user={user} initials={initials} /></span>
        <span className="min-w-0">
          <span className="block truncate text-body-sm font-semibold text-sidebar-foreground">{accountName(user) || "Admin"}</span>
          <span className="block text-caption text-sidebar-foreground/60">Administrator</span>
        </span>
      </div>
    </div>
  );

  return (
    <div className="tt-admin-shell flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">{sidebar}</aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Admin menu</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex min-h-[4rem] shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
          <span className="tt-admin-breadcrumb hidden xl:block text-sm text-muted-foreground">Admin <span className="mx-2">/</span> {hub && <>{hub.label} <span className="mx-2">/</span> </>}{hub?.tabs.find((t) => t.id === active)?.label || current?.label || "Overview"}</span>
          <SectionSearch onNavigate={nav} />
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <p className="hidden whitespace-nowrap text-body-sm text-muted-foreground md:block">
              {fmtDate()} <LiveClock seconds={false} mono={false} className="ml-1 font-semibold text-foreground" />
            </p>
            {headerActions}
            {pushPermission !== "granted" && pushPermission !== "unsupported" && onEnableNotifications && (
              <Button variant="ghost" size="icon" onClick={onEnableNotifications} aria-label="Turn on SOS notifications on this device" title="Turn on SOS notifications on this device">
                <Bell className="h-5 w-5" aria-hidden="true" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-secondary text-body-sm font-bold hover:ring-2 hover:ring-ring" aria-label="Account menu"><AccountPicture user={user} initials={initials} /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user?.email || "Admin"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => nav("profile")}><User className="mr-2 h-4 w-4" /> My profile</DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/account"><Settings className="mr-2 h-4 w-4" /> Account and appearance</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onSignOut?.()}><LogOut className="mr-2 h-4 w-4" /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {alertVehicles.length > 0 && (
          <button
            type="button"
            onClick={() => nav("fleet")}
            className="flex w-full items-center gap-3 bg-danger px-4 py-3 text-left text-danger-foreground sm:px-6"
          >
            <Siren className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="text-body-sm font-semibold">
              SOS: {alertVehicles.map((v) => v.name).join(", ")} {alertVehicles.length === 1 ? "needs" : "need"} immediate attention
            </span>
            <span className="ml-auto hidden shrink-0 text-body-sm underline sm:inline">Open Live Fleet</span>
          </button>
        )}

        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8">
          {hub ? (
            // A hub: its name, then its tabs with the open tab's main actions
            // beside them, then that tab's short description.
            <div className="mb-5">
              <h1 className="text-headline font-bold">{title}</h1>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <HubTabs hub={hub} active={active} />
                <div ref={setActionsEl} className="empty:hidden" />
              </div>
              <div ref={setIntroEl} />
            </div>
          ) : (
            <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <div className="min-w-0">
                <h1 className="text-headline font-bold">{title}</h1>
                {active === "overview" && <p className="mt-1 text-body-sm text-muted-foreground">Across all companies</p>}
                <div ref={setIntroEl} />
              </div>
              <div ref={setActionsEl} className="empty:hidden" />
            </div>
          )}
          <PageSlots.Provider value={slots}>{children}</PageSlots.Provider>
        </main>
      </div>
    </div>
  );
}