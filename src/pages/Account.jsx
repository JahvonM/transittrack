import React from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight, IdCard, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";
import ProfileInfo from "@/components/ProfileInfo";
import BoardingPass from "@/components/staff/BoardingPass";
import MyNotifications from "@/components/staff/MyNotifications";
import ChangePassword from "@/components/ChangePassword";
import ThemeToggle from "@/components/ThemeToggle";
import AccentPicker from "@/components/AccentPicker";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DRIVER_LINKS = [
  { to: "/driver-schedule", label: "My shifts", hint: "Today's and upcoming trips", icon: CalendarClock },
  { to: "/driver-profile", label: "My driver profile", hint: "Assigned buses and inspection history", icon: IdCard },
];

export default function Account() {
  const { user, logout } = useAuth();
  return (
    <AppLayout variant="passenger" back={{ to: "/more", label: "More" }} title="Account">
      <div className="grid grid-cols-1 items-start gap-4 px-4 pb-6 md:px-0 lg:grid-cols-2">
        <div className="space-y-4">
        <ProfileInfo />
        {['staff', 'passenger'].includes(user?.role) && <BoardingPass />}
        {user?.role === "driver" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Driver</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {DRIVER_LINKS.map(({ to, label, hint, icon: Icon }) => (
                <Link key={to} to={to} className="flex items-center gap-3 p-2.5 -mx-2 rounded-xl hover:bg-accent transition-colors">
                  <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
        <ChangePassword />
        </div>
        <div className="space-y-4">
        {['staff', 'passenger'].includes(user?.role) && <MyNotifications />}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-sm font-medium mb-1">Mode</p>
              <p className="text-sm text-muted-foreground mb-3">Light or dark. Remembered on this device.</p>
              <ThemeToggle />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Colour theme</p>
              <p className="text-sm text-muted-foreground mb-3">Changes buttons, highlights and map routes. Saved to your account.</p>
              <AccentPicker />
            </div>
          </CardContent>
        </Card>
        </div>
        {/* Phones have no header on passenger screens, so sign-out lives here too. */}
        <Button variant="outline" size="lg" className="w-full justify-center md:hidden" onClick={() => logout()}>
          <LogOut className="h-5 w-5" aria-hidden="true" /> Sign out
        </Button>
      </div>
    </AppLayout>
  );
}