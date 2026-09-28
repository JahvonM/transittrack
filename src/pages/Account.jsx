import React from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight, IdCard } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import ProfileInfo from "@/components/ProfileInfo";
import ChangePassword from "@/components/ChangePassword";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DRIVER_LINKS = [
  { to: "/driver-schedule", label: "My shifts", hint: "Today's and upcoming trips", icon: CalendarClock },
  { to: "/driver-profile", label: "My driver profile", hint: "Assigned buses and inspection history", icon: IdCard },
];

export default function Account() {
  const { user } = useAuth();
  return (
    <AppLayout title="My account">
      <div className="max-w-xl space-y-4">
        <ProfileInfo />
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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Switch between light and dark mode. Your choice is remembered on this device.
            </p>
            <ThemeToggle />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
