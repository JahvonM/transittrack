import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Bus, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppLayout({ children, title }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-slate-700/50 bg-background/80 backdrop-blur-[12px]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 font-heading font-semibold">
            <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center shrink-0">
              <Bus className="w-4 h-4" />
            </span>
            Transit Hub
          </Link>
          <div className="flex items-center gap-2">
            {user && (
              <span className="hidden sm:block text-sm text-muted-foreground max-w-[220px] truncate">
                {user.full_name || user.email}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => logout()}>
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline ml-1.5">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        {title && <h1 className="text-2xl font-heading font-semibold mb-4">{title}</h1>}
        {children}
      </main>
    </div>
  );
}