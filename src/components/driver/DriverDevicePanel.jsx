import React from "react";
import { Bus, Building2, Tablet, LogOut, Sun, Moon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import useTheme from "@/hooks/useTheme";

export default function DriverDevicePanel({ session, deviceId, onUnpair }) {
  const vehicle = session?.vehicle;
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tablet &amp; vehicle</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
            <Bus className="w-5 h-5 text-primary shrink-0" />
            <div>
              <div className="text-sm font-medium">{vehicle?.name || "—"}</div>
              <div className="text-xs text-muted-foreground">{vehicle?.plate_number || "No plate"} · {vehicle?.type}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
            <Building2 className="w-5 h-5 text-primary shrink-0" />
            <div>
              <div className="text-sm font-medium">{vehicle?.company_name || session?.company_name || "—"}</div>
              <div className="text-xs text-muted-foreground">Company</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
            <Tablet className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{deviceId}</div>
              <div className="text-xs text-muted-foreground">Device ID</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
            {isDark ? <Moon className="w-5 h-5 text-primary shrink-0" /> : <Sun className="w-5 h-5 text-primary shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{isDark ? "Dark mode" : "Light mode"}</div>
              <div className="text-xs text-muted-foreground">Applies to this tablet</div>
            </div>
            <Switch checked={isDark} onCheckedChange={toggle} aria-label="Toggle dark mode" />
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={onUnpair}>
          <LogOut className="w-4 h-4 mr-2" /> Unpair tablet
        </Button>
        <p className="text-xs text-muted-foreground text-center">Unpairing will require a new pairing code to use this tablet again.</p>
      </CardContent>
    </Card>
  );
}
