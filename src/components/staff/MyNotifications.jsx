import React, { useEffect, useState } from "react";
import { Mail, Smartphone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { withRateLimitRetry } from "@/lib/scopedEntities";
import { errorData } from "@/lib/requestError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

const call = async (body) => (await withRateLimitRetry(() => base44.functions.invoke("myNotifications", body), { attempts: 3 })).data;

/** A passenger's own choice of which emails and phone alerts they get. */
export default function MyNotifications() {
  const { toast } = useToast();
  const [choices, setChoices] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");

  const load = () => {
    setFailed(false);
    call({ action: "get" }).then((d) => setChoices(d.choices || [])).catch(() => setFailed(true));
  };
  useEffect(() => { load(); }, []);

  const set = async (c, on) => {
    setBusy(c.key);
    setChoices((list) => list.map((x) => (x.key === c.key ? { ...x, on } : x)));
    try {
      const d = await call({ action: "set", key: c.key, on });
      setChoices(d.choices || []);
    } catch (e) {
      setChoices((list) => list.map((x) => (x.key === c.key ? { ...x, on: !on } : x)));
      toast({ title: "Couldn't save that setting", description: errorData(e).error || e.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {failed ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Couldn't load your notification settings.</p>
            <Button variant="outline" size="sm" onClick={load}>Try again</Button>
          </div>
        ) : !choices ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="space-y-2" aria-label="Notifications">
            {choices.map((c) => {
              const Icon = c.channel === "email" ? Mail : Smartphone;
              const id = `my-ntf-${c.key}`;
              return (
                <li key={c.key}>
                  <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{c.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.available ? c.when : "Switched off by your transport company"}
                      </span>
                    </span>
                    <Switch id={id} className="!min-h-0" checked={c.available && c.on} disabled={!c.available || busy === c.key}
                      onCheckedChange={(v) => set(c, v)} />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Alerts when a bus is one stop away are set where you choose your pickup stop.</p>
      </CardContent>
    </Card>
  );
}
