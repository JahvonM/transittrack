import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Bus, LogOut, LayoutDashboard, Car, ShieldCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppLayout({ children, title }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const role = user?.role || "passenger";

  const nav = [
    { to: "/", label: "Passenger", icon: MapPin, show: true },
    { to: "/company", label: "Dashboard", icon: LayoutDashboard, show: role === "company" },
    { to: "/driver", label: "Driver App", icon: Car, show: role === "driver" },
    { to: "/admin", label: "Admin", icon: ShieldCheck, show: role === "admin" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Bus className="w-4 h-4" />
            </span>
            TransitLive
          </Link>
          <nav className="flex items-center gap-1">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = location.pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm transition-colors ${
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{n.label}</span>
                </Link>
              );
            })}
            <Button variant="ghost" size="sm" onClick={() => logout()} className="ml-1">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline ml-1.5">Logout</span>
            </Button>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        {title && <h1 className="text-2xl font-semibold mb-4">{title}</h1>}
        {children}
      </main>
    </div>
  );
}