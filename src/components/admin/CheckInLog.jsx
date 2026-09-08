import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogIn, LogOut, RefreshCw } from "lucide-react";

export default function CheckInLog({ vehicles }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.StaffCheckIn.list("-created_date", 200);
      setRecords(list || []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = filter === "all" ? records : records.filter((r) => r.vehicle_id === filter);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <LogIn className="w-4 h-4" /> Bus sign-in / sign-out log
        </CardTitle>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="Filter by bus" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All buses</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No check-ins recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                <div
                  className={`w-9 h-9 rounded-full grid place-items-center shrink-0 ${
                    r.status === "boarded" ? "bg-emerald-500/15 text-emerald-400" : "bg-sky-500/15 text-sky-400"
                  }`}
                >
                  {r.status === "boarded" ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.staff_name || "Unknown staff"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.vehicle_name || "—"}{r.company_name ? ` · ${r.company_name}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant={r.status === "boarded" ? "default" : "secondary"}>
                    {r.status === "boarded" ? "Signed in" : "Signed out"}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">
                    {r.boarded_at ? new Date(r.boarded_at).toLocaleString() : "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}