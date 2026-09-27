import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

export default function AppLayout({ children, title }) {
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
              <span className="hidden sm:inline">MCSween's Transport</span>
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
        <div key={pathname} className="tt-page-in">{children}</div>
      </main>
    </div>
  );
}