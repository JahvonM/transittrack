import React, { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardCheck, Volume2, AlertTriangle } from "lucide-react";

const CHECKLIST = [
  { key: "brakes", label: "Brakes are responsive" },
  { key: "tires", label: "Tires are inflated and undamaged" },
  { key: "lights", label: "Headlights, signals and brake lights work" },
  { key: "fluids", label: "Oil, coolant and washer fluid at correct levels" },
  { key: "cleanliness", label: "Interior is clean and seats are secure" },
];

export default function PreTripInspection({ vehicle, invoke, driverName, onCompleted }) {
  const [checks, setChecks] = useState({});
  const [odometer, setOdometer] = useState(vehicle?.current_odometer || "");
  const [fuel, setFuel] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [reading, setReading] = useState(false);
  const spoken = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (spoken.current) return;
    spoken.current = true;
    if (!window.speechSynthesis) return;
    const text = "Pre-trip safety inspection. Please verify: " + CHECKLIST.map((c, i) => `Item ${i + 1}. ${c.label}.`).join(" ") + " Confirm each item before starting your route.";
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.95;
    setReading(true);
    utter.onend = () => setReading(false);
    window.speechSynthesis.speak(utter);
    return () => window.speechSynthesis.cancel();
  }, []);

  const toggle = (key) => setChecks((p) => ({ ...p, [key]: !p[key] }));
  const allChecked = CHECKLIST.every((c) => checks[c.key] !== undefined);
  const failed = CHECKLIST.filter((c) => checks[c.key] === false);

  const submit = async () => {
    if (!allChecked) { toast({ title: "Please confirm every item", variant: "destructive" }); return; }
    setSubmitting(true);
    const passed = failed.length === 0;
    const checklistObj = CHECKLIST.reduce((acc, c) => { acc[c.key] = checks[c.key] === true; return acc; }, {});
    try {
      const result = await invoke("submit_inspection", {
        checklist: checklistObj,
        odometer: odometer ? Number(odometer) : undefined,
        fuel: Number(fuel),
        status: passed ? "passed" : "failed",
        service_notes: !passed ? "Failed items: " + failed.map((f) => f.label).join("; ") : "",
      });
      toast({
        title: passed ? "Inspection passed" : "Inspection flagged for service",
        description: passed ? "You're clear to start your route." : "A mechanic has been notified. Proceed with caution.",
        variant: passed ? "default" : "destructive",
      });
      onCompleted(result?.inspection, passed);
    } catch (e) {
      toast({ title: "Couldn't save inspection", description: e.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" /> Pre-trip inspection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Volume2 className={`w-4 h-4 ${reading ? "text-primary animate-pulse" : ""}`} />
          {reading ? "Reading checklist aloud…" : "Checklist read aloud"}
        </div>
        <div className="space-y-2">
          {CHECKLIST.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-card">
              <span className="text-sm">{c.label}</span>
              <div className="flex gap-1">
                <Button size="sm" variant={checks[c.key] === true ? "default" : "outline"} onClick={() => toggle(c.key)} className="h-7 px-2">Pass</Button>
                <Button size="sm" variant={checks[c.key] === false ? "destructive" : "outline"} onClick={() => toggle(c.key)} className="h-7 px-2">Fail</Button>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Odometer (km)</Label>
            <Input type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label className="text-xs">Fuel level: {fuel}%</Label>
            <input type="range" min="0" max="100" value={fuel} onChange={(e) => setFuel(e.target.value)} className="w-full mt-2" />
          </div>
        </div>
        {failed.length > 0 && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <span>{failed.length} item(s) failed — a mechanic will be notified.</span>
          </div>
        )}
        <Button className="w-full" onClick={submit} disabled={!allChecked || submitting}>
          {submitting ? "Saving…" : "Complete inspection"}
        </Button>
      </CardContent>
    </Card>
  );
}