import React, { useState } from "react";
import {
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
  RefreshCw,
  Sparkles,
  User,
  Users,
  Smartphone,
  ClipboardList,
  Database,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export const ADMIN_SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "trips", label: "Trips", icon: CalendarPlus },
  { id: "fleet", label: "Live fleet", icon: MapPin },
  { id: "vehicles", label: "Vehicles", icon: Bus },
  { id: "kiosks", label: "Kiosk tablets", icon: Smartphone },
  { id: "checkins", label: "Sign-in log", icon: ClipboardList },
  { id: "billing", label: "Completed & billing", icon: Building2 },
  { id: "users", label: "Users & roles", icon: Users },
  { id: "service", label: "Service Queue", icon: Wrench },
  { id: "drivers", label: "Drivers", icon: Car },
  { id: "sync", label: "Fleet sync", icon: RefreshCw },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "messaging", label: "Messaging", icon: Megaphone },
  { id: "ads", label: "Advertisements", icon: ImageIcon },
  { id: "copilot", label: "AI copilot", icon: Sparkles },
  { id: "data", label: "Data manager", icon: Database },
  { id: "profile", label: "My profile", icon: User },
];

export default function AdminShell({ active, onNavigate, children }) {
  const [open, setOpen] = useState(false);

  const NavList = () => (
    <nav className="space-y-1">
      {ADMIN_SECTIONS.map((s) => {
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
      })}
    </nav>
  );

  const current = ADMIN_SECTIONS.find((s) => s.id === active);

  return (
    <div>
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