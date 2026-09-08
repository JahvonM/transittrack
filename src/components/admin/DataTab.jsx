import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Database, FileSpreadsheet, FileText, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { exportToCSV, exportToPDF } from "@/lib/exporters";

const ENTITIES = [
  "Company", "Vehicle", "Route", "Trip", "User",
  "Broadcast", "Advertisement", "Workplace", "Inspection", "Incident",
  "StaffCheckIn", "FrontDeskSignIns",
];

const LABELS = {
  id: "ID",
  name: "Name",
  title: "Title",
  full_name: "Full name",
  email: "Email",
  role: "Role",
  phone: "Phone",
  type: "Type",
  status: "Status",
  message: "Message",
  active: "Active",
  company_id: "Company ID",
  company_name: "Company",
  access_code: "Access code",
  plate_number: "Plate",
  capacity: "Capacity",
  driver_name: "Driver",
  driver_email: "Driver email",
  driver_pin: "Driver PIN",
  entry_code: "Entry code",
  route_id: "Route ID",
  route_name: "Route",
  staff_name: "Staff",
  card_tag: "Badge tag",
  vehicle_name: "Bus",
  vehicle_id: "Bus ID",
  boarded_at: "Time",
  occurred_at: "Occurred at",
  date: "Date",
  details: "Details",
  signature_url: "Signature",
  signed_at: "Signed at",
  created_by_id: "Created by",
  created_date: "Created",
  updated_date: "Updated",
};

const PRIORITY = [
  "name", "title", "full_name", "email", "role", "company_name", "plate_number",
  "type", "status", "staff_name", "vehicle_name", "boarded_at", "occurred_at",
  "date", "created_date", "updated_date", "id",
];

function deriveColumns(records) {
  if (!records.length) return [];
  const keys = [];
  records.forEach((r) => Object.keys(r).forEach((k) => { if (!keys.includes(k)) keys.push(k); }));
  keys.sort((a, b) => {
    const ia = PRIORITY.indexOf(a);
    const ib = PRIORITY.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return keys.map((k) => ({ key: k, label: LABELS[k] || k }));
}

function fmtCell(val) {
  if (val == null) return "";
  if (Array.isArray(val)) return val.length ? `${val.length} items` : "—";
  if (typeof val === "object") return "…";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    const d = new Date(val);
    return isNaN(d) ? val : d.toLocaleString();
  }
  return String(val);
}

export default function DataTab() {
  const { toast } = useToast();
  const [entity, setEntity] = useState("Vehicle");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await base44.entities[entity].list("-updated_date", 200);
      setRecords(data || []);
    } catch {
      setRecords([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const columns = useMemo(() => deriveColumns(records), [records]);

  const remove = async (id) => {
    try {
      await base44.entities[entity].delete(id);
      toast({ title: "Record deleted" });
      load();
    } catch {
      toast({ title: "Couldn't delete this record", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Database className="w-4 h-4 text-primary" /> Browse, manage, and export every data collection in the platform.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITIES.map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToCSV(entity, columns, records)} disabled={!records.length}>
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportToPDF(entity, `${entity} records`, columns, records)} disabled={!records.length}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">No records in {entity}.</CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className="whitespace-nowrap">{c.label}</TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className="whitespace-nowrap text-xs max-w-[240px] truncate"
                      title={fmtCell(r[c.key])}
                    >
                      {fmtCell(r[c.key])}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(r.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {records.length > 0 && (
        <p className="text-xs text-muted-foreground">{records.length} records · showing latest 200</p>
      )}
    </div>
  );
}