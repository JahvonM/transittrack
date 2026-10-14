import React, { useEffect, useState } from "react";
import EmptyState from "@/components/EmptyState";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileSpreadsheet, FileText, LogIn, LogOut, RefreshCw, CreditCard, QrCode, Search } from "lucide-react";
import { exportToCSV, exportToPDF } from "@/lib/exporters";
import BusLoader from "@/components/BusLoader";
import DailyCheckInLog from "@/components/admin/DailyCheckInLog";

const CHECKIN_COLS = [
  { key: "staff_name", label: "Passenger" },
  { key: "status", label: "Status" },
  { key: "check_in_method", label: "Method" },
  { key: "vehicle_name", label: "Bus" },
  { key: "company_name", label: "Company" },
  { key: "card_tag", label: "Badge tag" },
  { key: "boarded_at", label: "Time" },
  { key: "created_date", label: "Logged" },
];

const METHOD_META = {
  nfc: { label: "NFC", icon: CreditCard },
  qr: { label: "QR", icon: QrCode },
  manual: { label: "Manual", icon: Search },
};

function BusCheckIns({ vehicles }) {
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

  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? records : records.filter((r) => r.vehicle_id === filter);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-72" aria-label="Bus">
            <SelectValue placeholder="Filter by bus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All buses</SelectItem>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToCSV("checkin-log", CHECKIN_COLS, filtered)} disabled={!filtered.length}>
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportToPDF("checkin-log", "Bus sign-in / sign-out log", CHECKIN_COLS, filtered)} disabled={!filtered.length}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <BusLoader className="py-8" />
      ) : filtered.length === 0 ? (
        <EmptyState text="No check-ins recorded yet." />
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const method = METHOD_META[r.check_in_method] || METHOD_META.manual;
            const MethodIcon = method.icon;
            return (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                <div
                  className={`w-9 h-9 rounded-full grid place-items-center shrink-0 ${
                    r.status === "boarded" ? "bg-success/15 text-success" : "bg-info/15 text-info"
                  }`}
                >
                  {r.status === "boarded" ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.staff_name || "Unknown passenger"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.vehicle_name || "—"}{r.company_name ? ` · ${r.company_name}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <div className="flex items-center gap-1.5 justify-end">
                    <StatusChip tone="neutral" dot={false}><MethodIcon className="h-3 w-3" aria-hidden="true" /> {method.label}</StatusChip>
                    <StatusChip tone={r.status === "boarded" ? "success" : "neutral"}>
                      {r.status === "boarded" ? "Signed in" : "Signed out"}
                    </StatusChip>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.boarded_at ? new Date(r.boarded_at).toLocaleString() : "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CheckInLog({ vehicles }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <Tabs defaultValue="bus">
          <TabsList>
            <TabsTrigger value="bus">Bus check-ins</TabsTrigger>
            <TabsTrigger value="daily">Daily log</TabsTrigger>
          </TabsList>
          <TabsContent value="bus" className="mt-4">
            <BusCheckIns vehicles={vehicles} />
          </TabsContent>
          <TabsContent value="daily" className="mt-4">
            <DailyCheckInLog />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}