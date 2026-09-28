import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Database, FileSpreadsheet, FileText, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { exportToCSV, exportToPDF } from "@/lib/exporters";
import BusLoader from "@/components/BusLoader";

// Minimal "quick add" field sets per entity — covers the fields you actually
// need to create a usable record by hand. User and FrontDeskSignIns are
// intentionally left out: Users must go through the invite flow (a raw row
// here wouldn't have a login), and front-desk sign-ins are only ever created
// by the front-desk kiosk itself (its RLS blocks direct client creates).
const CREATE_FIELDS = {
  Company: [
    { key: "name", label: "Name", required: true },
    { key: "phone", label: "Phone" },
    { key: "access_code", label: "Access code" },
  ],
  Vehicle: [
    { key: "name", label: "Name", required: true },
    { key: "type", label: "Type (bus / taxi)", required: true, placeholder: "bus" },
    { key: "company_id", label: "Company ID", required: true },
    { key: "plate_number", label: "Plate number" },
    { key: "driver_name", label: "Driver name" },
    { key: "driver_email", label: "Driver email" },
    { key: "capacity", label: "Capacity", type: "number" },
  ],
  Route: [
    { key: "name", label: "Name", required: true },
    { key: "company_id", label: "Company ID", required: true },
    { key: "type", label: "Type (staff / airport)", placeholder: "staff" },
  ],
  Trip: [
    { key: "company_id", label: "Company ID", required: true },
    { key: "pickup_name", label: "Pickup name" },
    { key: "dropoff_name", label: "Drop-off name" },
    { key: "passenger_name", label: "Passenger name" },
    { key: "passenger_phone", label: "Passenger phone" },
    { key: "scheduled_time", label: "Scheduled time", type: "datetime-local" },
  ],
  Broadcast: [
    { key: "type", label: "Type (bus_arrived / taxi_arrived / info)", required: true, placeholder: "info" },
    { key: "title", label: "Title" },
    { key: "message", label: "Message", required: true },
  ],
  Advertisement: [
    { key: "title", label: "Title", required: true },
    { key: "message", label: "Message" },
    { key: "link", label: "Link" },
  ],
  Workplace: [
    { key: "name", label: "Name", required: true },
    { key: "company_id", label: "Company ID" },
    { key: "lat", label: "Latitude", type: "number" },
    { key: "lng", label: "Longitude", type: "number" },
  ],
  Inspection: [
    { key: "driver_name", label: "Driver name", required: true },
    { key: "vehicle_id", label: "Vehicle ID", required: true },
    { key: "company_id", label: "Company ID", required: true },
    { key: "date", label: "Date", required: true, type: "date" },
    { key: "status", label: "Status (passed / failed)", placeholder: "passed" },
  ],
  Incident: [
    { key: "type", label: "Type", required: true, placeholder: "other" },
    { key: "company_id", label: "Company ID", required: true },
    { key: "details", label: "Details" },
  ],
  StaffCheckIn: [
    { key: "card_tag", label: "Badge tag", required: true },
    { key: "status", label: "Status (boarded / off_board)", required: true, placeholder: "boarded" },
    { key: "staff_name", label: "Staff name" },
    { key: "company_id", label: "Company ID" },
    { key: "vehicle_id", label: "Vehicle ID" },
  ],
};

const UNCREATABLE_NOTES = {
  User: "New users are created from the Users & Roles tab (Invite), so they get a real login.",
  FrontDeskSignIns: "Sign-ins are created by the front-desk kiosk itself, not added by hand here.",
};

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
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({});
  const [adding, setAdding] = useState(false);

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
  const createFields = CREATE_FIELDS[entity] || null;

  const openAdd = () => {
    setAddForm({});
    setAddOpen(true);
  };

  const submitAdd = async () => {
    if (!createFields) return;
    const missing = createFields.some((f) => f.required && !String(addForm[f.key] || "").trim());
    if (missing) {
      toast({ title: "Fill in the required fields", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const payload = {};
      createFields.forEach((f) => {
        const raw = addForm[f.key];
        if (raw === undefined || raw === "") return;
        payload[f.key] = f.type === "number" ? Number(raw) : f.type === "datetime-local" ? new Date(raw).toISOString() : raw;
      });
      await base44.entities[entity].create(payload);
      toast({ title: "Record created" });
      setAddOpen(false);
      load();
    } catch (e) {
      toast({ title: "Couldn't create this record", description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

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
        {createFields && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add record
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToCSV(entity, columns, records)} disabled={!records.length}>
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportToPDF(entity, `${entity} records`, columns, records)} disabled={!records.length}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      {!createFields && UNCREATABLE_NOTES[entity] && (
        <p className="text-xs text-muted-foreground">{UNCREATABLE_NOTES[entity]}</p>
      )}

      {loading ? (
        <BusLoader className="py-8" />
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New {entity}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {(createFields || []).map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}{f.required && " *"}</Label>
                <Input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "datetime-local" ? "datetime-local" : "text"}
                  value={addForm[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <Button className="w-full" onClick={submitAdd} disabled={adding}>
            {adding ? "Creating…" : `Create ${entity}`}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}