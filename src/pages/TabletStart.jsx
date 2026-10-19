import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Bus, ScanLine, ShieldCheck, ChevronRight } from "lucide-react";
import { rememberKioskLayout } from "@/lib/kioskLayout";
import { savedTabletPath, rememberTabletMode } from "@/lib/kioskApp";

export default function TabletStart() {
  const [params] = useSearchParams();
  const saved = savedTabletPath();
  if (params.get("choose") !== "1" && saved !== "/tablet") return <Navigate to={saved} replace />;
  const options = [
    { mode: "driver", icon: Bus, title: "Driver tablet", description: "Driver PIN, route, stops and live GPS." },
    { mode: "kiosk", layout: "tablet", icon: ScanLine, title: "Kiosk tablet", description: "NFC cards, boarding codes, QR and pickup signs." },
    { mode: "kiosk", layout: "phone", icon: ScanLine, title: "Kiosk phone", description: "A compact phone layout for tap, code and QR sign-in." },
  ];
  return <main className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-6 safe-area-top safe-area-bottom">
    <div className="w-full max-w-xl space-y-8 py-8">
      <header className="space-y-3">
        <p className="text-primary font-semibold tracking-widest text-sm uppercase">McSween Transport Kiosk</p>
        <h1 className="text-3xl font-bold">What is this tablet for?</h1>
        <p className="text-muted-foreground">Choose once. This app will remember and open the right screen next time.</p>
      </header>
      <div className="space-y-4">
        {options.map(({ mode, layout, icon: Icon, title, description }) => <Link key={mode + (layout || "")} to={"/" + mode} onClick={() => { rememberTabletMode(mode); if (layout) rememberKioskLayout(layout); }}
          className="flex items-center gap-4 rounded-3xl border border-border bg-card p-6 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span className="rounded-2xl bg-primary/10 p-4 text-primary"><Icon className="h-7 w-7" /></span>
          <span className="flex-1"><span className="block text-xl font-semibold">{title}</span><span className="block mt-2 text-sm text-muted-foreground">{description}</span></span>
          <ChevronRight className="h-5 w-5 shrink-0" />
        </Link>)}
      </div>
      <p className="text-sm text-muted-foreground flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0" />Your administrator's pairing code selects the company, vehicle and tablet type. Drivers use the bus PIN. No email account is needed.</p>
      <footer className="flex gap-6 text-sm text-muted-foreground"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></footer>
    </div>
  </main>;
}
