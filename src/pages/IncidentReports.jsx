import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import PullToRefresh from "@/components/PullToRefresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { AlertOctagon, Image as ImageIcon, Loader2, Smartphone } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";

const STATUSES = ["open", "investigating", "resolved"];

// Photos a driver sent from the phone app are private files: each is opened
// through a link that only works for a few minutes.
function IncidentPhotos({ uris }) {
  const [urls, setUrls] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const show = async () => {
    setBusy(true); setError("");
    try {
      const signed = await Promise.all(uris.map((file_uri) =>
        base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 300 }).then((r) => r?.signed_url || "")));
      setUrls(signed.filter(Boolean));
    } catch {
      setError("Couldn't open the photos. Try again.");
    } finally {
      setBusy(false);
    }
  };
  if (urls) {
    return (
      <div className="flex flex-wrap gap-2">
        {urls.map((url, n) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-lg border border-border">
            <img src={url} alt={`Report photo ${n + 1}`} className="h-full w-full object-cover" />
          </a>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={show} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
        View {uris.length} {uris.length === 1 ? "photo" : "photos"}
      </Button>
      {error && <span role="alert" className="text-body-sm text-danger">{error}</span>}
    </div>
  );
}
const next = (s) => STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length];

export default function IncidentReports() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const all = await base44.entities.Incident.list("-occurred_at", 500);
      setItems(all);
    } catch {
      loadFailed(load);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const cycle = async (i) => {
    const ns = next(i.status || "open");
    try {
      await base44.entities.Incident.update(i.id, { status: ns });
      toast({ title: `Status → ${ns}` });
      load();
    } catch (e) {
      toast({ title: "Couldn't update status", description: e.message, variant: "destructive" });
    }
  };


  return (
    <AppLayout title="Incident reports">
      <PullToRefresh onRefresh={load}>
      {loading ? <BusLoader className="py-8" /> : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No incidents logged.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {items.map((i) => (
            <Card key={i.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2"><AlertOctagon className="w-4 h-4 text-danger" /> {i.vehicle_name || "Vehicle"} · {i.type}</span>
                  <StatusChip status={i.status || "open"} />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="text-muted-foreground">{i.company_name || "—"} · {i.driver_name || "—"} · {i.occurred_at ? new Date(i.occurred_at).toLocaleString() : "—"}</div>
                {i.source === "driver_phone" && (
                  <StatusChip tone="info" dot={false}><Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> Sent from the driver phone app</StatusChip>
                )}
                {i.details && <div>{i.details}</div>}
                {Array.isArray(i.photo_uris) && i.photo_uris.length > 0 && <IncidentPhotos uris={i.photo_uris} />}
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => cycle(i)}>Advance status →</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </PullToRefresh>
    </AppLayout>
  );
}