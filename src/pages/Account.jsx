import React from "react";
import AppLayout from "@/components/AppLayout";
import ProfileInfo from "@/components/ProfileInfo";
import ChangePassword from "@/components/ChangePassword";
import ThemeToggle from "@/components/ThemeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Account() {
  return (
    <AppLayout title="My account">
      <div className="max-w-xl space-y-4">
        <ProfileInfo />
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