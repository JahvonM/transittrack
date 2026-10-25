import DriverBackgroundPanel from "@/components/driver/DriverBackgroundPanel";
import TabletCellularPanel from "@/components/driver/TabletCellularPanel";
import NativeNetworkPanel from "@/components/driver/NativeNetworkPanel";
import TabletRecoveryPanel from "@/components/driver/TabletRecoveryPanel";
import TabletDiagnosticsPanel from "@/components/driver/TabletDiagnosticsPanel";
import UsbGpsPanel from "@/components/driver/UsbGpsPanel";
import React from "react";
import { Link } from "react-router-dom";
import { Bus, Building2, Tablet, LogOut, Sun, Moon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/tablet/settingsKit";
import TabletSettings from "@/components/tablet/TabletSettings";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useIsDark } from "@/lib/useTheme";
import useTheme from "@/hooks/useTheme";
import TabletNetworkPanel from "@/components/driver/TabletNetworkPanel";

function Fact({ icon: Icon, title, detail, children }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className="w-5 h-5 shrink-0" style={{ color: "var(--ts-teal)" }} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      {children}
    </div>
  );
}

// Driver tablet → Settings.
export default function DriverDevicePanel({ session, deviceId, onUnpair }) {
  const vehicle = session?.vehicle;
  const { toggle } = useTheme();
  const isDark = useIsDark();

  const thisTablet = (
    <Card>
      <CardHeader><CardTitle>This tablet</CardTitle></CardHeader>
      <CardContent>
        <div className="divide-y">
          <Fact icon={Bus} title={vehicle?.name || "No bus"} detail={[vehicle?.plate_number || "No plate", vehicle?.type].filter(Boolean).join(", ")} />
          <Fact icon={Building2} title={vehicle?.company_name || session?.company_name || "No company"} detail="Company" />
          <Fact icon={Tablet} title={deviceId} detail="Device ID" />
          <Fact icon={isDark ? Moon : Sun} title={isDark ? "Dark screens" : "Light screens"} detail="For the driver screens on this tablet">
            <Switch checked={isDark} onCheckedChange={toggle} aria-label="Dark screens" />
          </Fact>
        </div>
        <Button asChild variant="outline" className="w-full"><Link to="/tablet?choose=1">Choose tablet screen</Link></Button>
        <Button variant="outline" className="w-full" onClick={onUnpair}>
          <LogOut className="w-4 h-4 mr-2" /> Unpair tablet
        </Button>
        <p className="text-xs text-muted-foreground text-center">After unpairing, the tablet needs a new pairing code from Admin.</p>
      </CardContent>
    </Card>
  );

  return (
    <TabletSettings
      subtitle={vehicle?.name ? `Driver tablet, ${vehicle.name}` : "Driver tablet"}
      sections={[
        { id: "gps", label: "GPS", content: <><UsbGpsPanel /><DriverBackgroundPanel vehicle={vehicle} /></> },
        { id: "connection", label: "Connection", content: <><TabletNetworkPanel /><NativeNetworkPanel /><TabletCellularPanel /></> },
        { id: "startup", label: "Startup", content: <TabletRecoveryPanel /> },
        { id: "health", label: "Tablet health", content: <TabletDiagnosticsPanel /> },
        { id: "tablet", label: "This tablet", content: thisTablet },
      ]}
    />
  );
}
