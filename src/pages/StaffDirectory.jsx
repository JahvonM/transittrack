import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, MessageCircle } from "lucide-react";

export default function StaffDirectory() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([base44.entities.Trip.list("-updated_date", 1000), base44.entities.User.list()]).then(([trips, users]) => {
      const byKey = new Map();
      for (const t of trips) {
        const phone = (t.passenger_phone || "").replace(/\D/g, "");
        const key = phone || t.passenger_email || t.passenger_name;
        if (!key) continue;
        if (!byKey.has(key)) byKey.set(key, { name: t.passenger_name || "Passenger", phone: t.passenger_phone || "", email: t.passenger_email || "" });
      }
      for (const u of users) {
        byKey.set(u.email || u.id, { name: u.full_name || "—", phone: u.phone || "", email: u.email || "" });
      }
      setPeople([...byKey.values()]); setLoading(false);
    });
  }, []);

  const waLink = (p) => {
    const digits = (p || "").replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  };

  return (
    <AppLayout title="Staff & passenger directory">
      {loading ? <p className="text-muted-foreground">Loading…</p> : people.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No contacts yet.</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {people.map((p, i) => {
            const wa = waLink(p.phone);
            return (
              <Card key={i}>
                <CardContent className="py-3 text-sm space-y-1">
                  <div className="font-medium flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> {p.name}</div>
                  {p.phone && <div className="text-muted-foreground">{p.phone}</div>}
                  {p.email && <div className="text-muted-foreground text-xs">{p.email}</div>}
                  {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-emerald-400 text-xs mt-1">
                      <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}