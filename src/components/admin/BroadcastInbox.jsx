import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox, RefreshCw } from "lucide-react";

export default function BroadcastInbox() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.Broadcast.list("-created_date", 30);
      setItems(list);
    } catch {
      /* ignore */
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.Broadcast.subscribe(() => load());
    return unsub;
  }, []);

  const replies = items.filter((b) => b.is_reply);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="w-4 h-4" /> Driver replies
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {replies.length === 0 && (
          <p className="text-sm text-muted-foreground">No driver replies yet.</p>
        )}
        {replies.map((b) => (
          <div key={b.id} className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{b.driver_name || b.driver_email}</span>
              <Badge variant="secondary">{b.vehicle_name}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{b.message}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}