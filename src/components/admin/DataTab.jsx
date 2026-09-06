import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const ENTITIES = [
  "Company", "Vehicle", "Route", "Trip", "User",
  "Broadcast", "Advertisement", "Workplace", "Inspection", "Incident",
];

export default function DataTab() {
  const { toast } = useToast();
  const [entity, setEntity] = useState("Vehicle");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await base44.entities[entity].list("-updated_date", 200);
      setRecords(data);
    } catch {
      setRecords([]);
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

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
        <Database className="w-4 h-4 text-primary" /> Browse and manage the records stored in each data collection.
      </div>
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
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">No records in {entity}.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{records.length} records</p>
          {records.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="font-medium truncate">
                    {r.name || r.title || r.full_name || r.id}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.email || r.plate_number || r.type || ""}{" "}
                    {r.updated_date ? `· ${new Date(r.updated_date).toLocaleString()}` : ""}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => remove(r.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}