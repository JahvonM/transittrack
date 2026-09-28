import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { MobileSelect } from "@/components/ui/mobile-select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import BusLoader from "@/components/BusLoader";
import EmptyState from "@/components/EmptyState";
import { loadFailed } from "@/lib/loadFailed";

const STATUSES = [
  { value: "open", label: "Looking for it" },
  { value: "found", label: "Found" },
  { value: "returned", label: "Returned" },
  { value: "closed", label: "Closed" },
];

const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");

// Lost-item reports from the staff app. Status changes show up on the
// reporter's own "Your reports" list.
export default function LostItemsTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setRows(await base44.entities.LostItemReport.list("-created_date", 300));
    } catch {
      loadFailed(load);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (r, status) => {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
    try {
      await base44.entities.LostItemReport.update(r.id, { status });
    } catch {
      setRows((prev) => prev.map((x) => (x.id === r.id ? r : x)));
      toast({ title: "Couldn't update", variant: "destructive" });
    }
  };

  if (loading) return <BusLoader className="py-8" />;
  const open = rows.filter((r) => r.status === "open").length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Lost items</h2>
        <p className="text-sm text-muted-foreground">{open} still being looked for. Only admins, the company and the person who reported it can see these.</p>
      </div>
      {!rows.length ? (
        <EmptyState text="No lost-item reports yet." />
      ) : (
        <div className="rounded-2xl border border-border divide-y divide-border bg-card">
          {rows.map((r) => (
            <div key={r.id} className="p-4 flex flex-wrap gap-3 items-start">
              <div className="flex-1 min-w-[220px]">
                <div className="font-medium">{r.description}</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {r.reporter_name || r.reporter_email || "Unknown"}
                  {r.contact ? ` · ${r.contact}` : ""}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2">
                  {r.company_name && <span>{r.company_name}</span>}
                  {r.vehicle_name && <Badge variant="secondary">{r.vehicle_name}</Badge>}
                  <span>{fmt(r.created_date)}</span>
                </div>
              </div>
              <MobileSelect value={r.status || "open"} onValueChange={(v) => setStatus(r, v)} options={STATUSES} triggerClassName="w-44" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
