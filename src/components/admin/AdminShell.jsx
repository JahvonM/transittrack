import React, { useState } from "react";
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
  MapPinned,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

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

  // Full pages shown inside the admin area (see ADMIN_PAGES in Admin.jsx).
  { id: "vehicle-logs", label: "Vehicle log", icon: FileText, group: "Fleet management" },
  { id: "driving-reports", label: "Driver report", icon: Gauge, group: "Fleet management" },
  { id: "location-timeline", label: "Location timeline", icon: MapPinned, group: "Fleet management" },
  { id: "route-analytics", label: "Route analysis", icon: LineChart, group: "Fleet management" },
  { id: "fleet-analytics", label: "Fleet analysis", icon: BarChart3, group: "Fleet management" },
  { id: "route-planner", label: "Route planner", icon: MapIcon, group: "Fleet management" },
  { id: "route-explorer", label: "Route explorer", icon: Route, group: "Fleet management" },

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
  { id: "audit", label: "Change history", icon: ScrollText, group: "Admin" },
  { id: "data", label: "Data manager", icon: Database, group: "Admin" },

  { id: "profile", label: "My profile", icon: User, group: null },
];

const GROUP_ORDER = ["Fleet Operations", "Fleet management", "Dispatch", "Maintenance", "Admin"];

export default function AdminShell({ active, onNavigate, children, alertVehicles = [] }) {
  const [open, setOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const toggleGroup = (group) => setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));

  const renderItem = (s) => {
    const Icon = s.icon;
    const isActive = active === s.id;
    return (
      <button
        key={s.id}
        onClick={() => {
          onNavigate(s.id);
          setOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <Icon className="w-4 h-4" /> {s.label}
      </button>
    );
  };

  // Overview stays pinned above every group, My profile below all of
  // them — everything else renders inside its own labeled, collapsible
  // cluster so admin/mechanic/dispatch areas read as distinct sections
  // instead of one long flat list.
  const topStandalone = ADMIN_SECTIONS.filter((s) => s.group === null && s.id !== "profile");
  const bottomStandalone = ADMIN_SECTIONS.filter((s) => s.id === "profile");

  const NavList = () => (
    <nav className="space-y-1">
      {topStandalone.map(renderItem)}

      {GROUP_ORDER.map((group) => {
        const items = ADMIN_SECTIONS.filter((s) => s.group === group);
        const hasActive = items.some((s) => s.id === active);
        const collapsed = !!collapsedGroups[group] && !hasActive;
        return (
          <div key={group} className="pt-3 first:pt-1">
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              <span>{group}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
            </button>
            {!collapsed && <div className="space-y-1 mt-0.5">{items.map(renderItem)}</div>}
          </div>
        );
      })}

      <div className="pt-3 mt-2 border-t border-border/60">
        {bottomStandalone.map(renderItem)}
      </div>
    </nav>
  );

  const current = ADMIN_SECTIONS.find((s) => s.id === active);

  return (
    <div>
      {alertVehicles.length > 0 && (
        <button
          onClick={() => onNavigate("fleet")}
          className="w-full mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-destructive text-destructive-foreground shadow-lg animate-pulse text-left"
        >
          <Siren className="w-5 h-5 shrink-0" />
          <span className="font-semibold text-sm">
            SOS — {alertVehicles.map((v) => v.name).join(", ")} {alertVehicles.length === 1 ? "needs" : "need"} immediate attention
          </span>
          <span className="ml-auto text-xs underline shrink-0 hidden sm:inline">View live fleet →</span>
        </button>
      )}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-heading font-semibold flex items-center gap-2">
            {current && <current.icon className="w-5 h-5 text-primary" />}
            {current?.label || "Admin"}
          </h1>
        </div>
        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Menu className="w-4 h-4 mr-2" /> Menu
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 overflow-y-auto">
              <div className="mt-6">
                <NavList />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <div className="flex gap-6">
        <aside className="hidden md:block w-52 shrink-0">
          <NavList />
        </aside>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}