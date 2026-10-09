import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  Sparkles,
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
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Logo from "@/components/Logo";
import LiveClock from "@/components/LiveClock";
import { cn } from "@/lib/utils";
import { PageSlots } from "@/components/admin/kit";

// `group` clusters the flat section list into labeled chunks in the sidebar
// (Fleet Operations / Maintenance — the mechanic's own area / Dispatch — the
// secretary/front-desk area / Admin) instead of one long undifferentiated
// list. `null` keeps an item standalone (Overview at top, My profile at
// bottom), matching the pre-grouping layout.
export const ADMIN_SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: null },

  { id: "trips", label: "Trips", icon: CalendarPlus, group: "Fleet Operations" },
  { id: "fleet", label: "Live fleet", icon: MapPin, group: "Fleet Operations" },
  { id: "vehicles", label: "Vehicles", icon: Bus, group: "Fleet Operations" },
  { id: "drivers", label: "Drivers", icon: Car, group: "Fleet Operations" },
  { id: "health", label: "Fleet health", icon: Activity, group: "Fleet Operations" },
  { id: "kiosks", label: "Kiosk tablets", icon: Smartphone, group: "Fleet Operations" },
  { id: "shifts", label: "Driver shifts", icon: Timer, group: "Fleet Operations" },
  { id: "cards", label: "Card issuing", icon: CreditCard, group: "Fleet Operations" },
  { id: "card-designs", label: "Card designer", icon: ImageIcon, group: "Fleet Operations" },

  // Full pages shown inside the admin area (see ADMIN_PAGES in Admin.jsx).
  { id: "vehicle-logs", label: "Vehicle log", icon: FileText, group: "Fleet management" },
  { id: "driving-reports", label: "Driver report", icon: Gauge, group: "Fleet management" },
  { id: "route-analytics", label: "Route analysis", icon: LineChart, group: "Fleet management" },
  { id: "fleet-analytics", label: "Fleet analysis", icon: BarChart3, group: "Fleet management" },
  { id: "route-planner", label: "Route planner", icon: MapIcon, group: "Fleet management" },
  { id: "route-explorer", label: "Route explorer", icon: Route, group: "Fleet management" },
  { id: "travel-times", label: "Travel times", icon: Hourglass, group: "Fleet management" },

  { id: "service", label: "Service Queue", icon: Wrench, group: "Maintenance" },
  { id: "faults", label: "Faults", icon: AlertTriangle, group: "Maintenance" },
  { id: "parts", label: "Parts", icon: Package, group: "Maintenance" },
  { id: "schedule", label: "Maintenance Schedule", icon: CalendarClock, group: "Maintenance" },
  { id: "calendar", label: "Maintenance Calendar", icon: Calendar, group: "Maintenance" },
  { id: "templates", label: "Inspection Templates", icon: ListChecks, group: "Maintenance" },
  { id: "inspection-history", label: "Inspection History", icon: History, group: "Maintenance" },
  { id: "service-history", label: "Service history", icon: History, group: "Maintenance" },
  { id: "incident-reports", label: "Incident reports", icon: AlertTriangle, group: "Maintenance" },
  { id: "safety-standards", label: "Safety standards", icon: ShieldCheck, group: "Maintenance" },

  { id: "directory", label: "Passenger directory", icon: Contact, group: "Dispatch" },
  { id: "checkins", label: "Sign-in log", icon: ClipboardList, group: "Dispatch" },
  { id: "billing", label: "Completed & billing", icon: Building2, group: "Dispatch" },
  { id: "messaging", label: "Messaging", icon: Megaphone, group: "Dispatch" },
  { id: "lost-items", label: "Lost items", icon: PackageSearch, group: "Dispatch" },
  { id: "ads", label: "Advertisements", icon: ImageIcon, group: "Dispatch" },
  { id: "ride-history", label: "Ride history", icon: History, group: "Dispatch" },
  { id: "passenger-bookings", label: "Passenger bookings", icon: BookOpen, group: "Dispatch" },
  { id: "support", label: "Passenger support", icon: LifeBuoy, group: "Dispatch" },

  { id: "users", label: "Users & roles", icon: Users, group: "Admin" },
  { id: "companies", label: "Companies", icon: Building2, group: "Admin" },
  { id: "copilot", label: "AI copilot", icon: Sparkles, group: "Admin" },
  { id: "notifications", label: "Notifications", icon: BellRing, group: "Admin" },
  { id: "app-errors", label: "App errors", icon: Bug, group: "Admin" },
  { id: "audit", label: "Change history", icon: ScrollText, group: "Admin" },
  { id: "data", label: "Data manager", icon: Database, group: "Admin" },

  { id: "profile", label: "My profile", icon: User, group: null },
];

const NAV_GROUPS = [
 {label:"Fleet",icon:Bus,ids:["fleet","vehicles","health","route-planner","route-explorer"]},
 {label:"Maintenance",icon:Wrench,ids:["service","faults","parts","schedule","calendar","templates","inspection-history","service-history","incident-reports","safety-standards"]},
 {label:"People & access",icon:Users,ids:["drivers","directory","users","cards","card-designs"]},
 {label:"Operations",icon:Activity,ids:["trips","kiosks","shifts","checkins","billing","messaging","lost-items","ride-history","passenger-bookings","support"]},
 {label:"Reports",icon:BarChart3,ids:["vehicle-logs","driving-reports","route-analytics","fleet-analytics","travel-times"]},
 {label:"All tools",icon:Database,ids:["notifications","app-errors","copilot","audit","data"]},
];
const PRIMARY = [
 {id:"overview",label:"Overview",icon:LayoutDashboard},
 {id:"companies",label:"Companies",icon:Building2},
 {id:"ads",label:"Advertisements",icon:ImageIcon},
 {id:"profile",label:"Settings",icon:Settings},
];
function NavItem({ item, active, onNavigate }) {
  const Icon = item.icon;
  const on = active === item.id;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
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

function SidebarNav({ active, onNavigate }) {
 const activeGroup=NAV_GROUPS.find(g=>g.ids.includes(active))?.label;
 const [openGroups,setOpenGroups]=useState(()=>activeGroup?{[activeGroup]:true}:{});
 useEffect(()=>{if(activeGroup)setOpenGroups(g=>({...g,[activeGroup]:true}));},[activeGroup]);
 const group=(g)=>{
  const Icon=g.icon,expanded=!!openGroups[g.label];
  return <div key={g.label} className="tt-admin-nav-group">
   <button type="button" aria-expanded={expanded} onClick={()=>setOpenGroups(v=>({...v,[g.label]:!v[g.label]}))} className={cn("tt-admin-group-toggle",activeGroup===g.label && "tt-admin-group-current")}>
    <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /><span>{g.label}</span><ChevronDown className={cn("w-4 h-4 transition-transform",!expanded && "-rotate-90")} aria-hidden="true" />
   </button>
   {expanded && <div className="tt-admin-group-items">{g.ids.map(id=>{const item=ADMIN_SECTIONS.find(s=>s.id===id);return <NavItem key={id} item={item} active={active} onNavigate={onNavigate} />;})}</div>}
  </div>;
 };
 return <nav aria-label="Admin" className="space-y-2">
  <NavItem item={PRIMARY[0]} active={active} onNavigate={onNavigate} />
  {NAV_GROUPS.slice(0,3).map(group)}
  <NavItem item={PRIMARY[1]} active={active} onNavigate={onNavigate} />
  {group(NAV_GROUPS[3])}
  <div className="tt-admin-nav-secondary">
   <NavItem item={PRIMARY[2]} active={active} onNavigate={onNavigate} />
   {group(NAV_GROUPS[4])}
   <NavItem item={PRIMARY[3]} active={active} onNavigate={onNavigate} />
   {group(NAV_GROUPS[5])}
  </div>
 </nav>;
}

// Finds any admin section by name, from the top bar.
function SectionSearch({ onNavigate }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const all = useMemo(() => {
    const seen = new Set();
    return [...PRIMARY, ...ADMIN_SECTIONS].filter((s) => (seen.has(s.id) ? false : seen.add(s.id)));
  }, []);
  const needle = q.trim().toLowerCase();
  const results = needle ? all.filter((s) => s.label.toLowerCase().includes(needle) || s.id.includes(needle)).slice(0, 8) : [];
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const go = (id) => { onNavigate(id); setQ(""); setOpen(false); };
  return (
    <div ref={box} className="relative min-w-0 flex-1 sm:max-w-md">
      <label className="flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Search admin</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && results[0]) go(results[0].id); if (e.key === "Escape") setOpen(false); }}
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
              <li key={r.id} role="option" aria-selected={false}>
                <button type="button" onClick={() => go(r.id)} className="flex min-h-[40px] w-full items-center gap-3 rounded-lg px-3 text-left text-body-sm hover:bg-accent">
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
 * Admin chrome: a full-height sidebar (main sections, then All tools), a
 * top bar with section search, date and time, notifications and the
 * account menu, and the SOS banner above the page.
 */
export default function AdminShell({ active, onNavigate, children, alertVehicles = [], user, onSignOut, pushPermission, onEnableNotifications, headerActions = null }) {
  const [open, setOpen] = useState(false);
  const [actionsEl, setActionsEl] = useState(null);
  const [introEl, setIntroEl] = useState(null);
  const slots = useMemo(() => ({ actions: actionsEl, intro: introEl }), [actionsEl, introEl]);
  const nav = (id) => { onNavigate(id); setOpen(false); };
  const current = ADMIN_SECTIONS.find((s) => s.id === active);
  const title = active === "overview" ? "Fleet overview" : PRIMARY.find((p) => p.id === active)?.label || current?.label || "Admin";
  const initials = nameInitials(user) || "A";

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to="/admin" className="flex h-16 shrink-0 items-center gap-2.5 px-5 font-heading text-title-sm font-bold text-sidebar-foreground">
        <Logo className="h-8 w-8" />
        <span>Transit<span className="text-sidebar-primary">Track</span></span>
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <SidebarNav active={active} onNavigate={nav} />
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-sidebar-border px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar-primary text-body-sm font-bold text-sidebar-primary-foreground" aria-hidden="true">{initials}</span>
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
          <span className="tt-admin-breadcrumb hidden xl:block text-sm text-muted-foreground">Admin <span className="mx-2">/</span> {current?.label || "Overview"}</span>
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
                <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-body-sm font-bold hover:ring-2 hover:ring-ring" aria-label="Account menu">{initials}</button>
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
          <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <h1 className="text-headline font-bold">{title}</h1>
              {active === "overview" && <p className="mt-1 text-body-sm text-muted-foreground">Across all companies</p>}
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