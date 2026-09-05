import React, { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";

export default function DriverMessages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const seen = useRef(new Set());

  useEffect(() => {
    if (!user?.email) return;
    base44.entities.Broadcast.list("-created_date", 20)
      .then((items) => {
        items.forEach((b) => seen.current.add(b.id));
      })
      .catch(() => {});
    const unsub = base44.entities.Broadcast.subscribe((event) => {
      if (event.type === "delete") return;
      const rec = event.data;
      if (!rec || seen.current.has(rec.id)) return;
      const targeted = rec.driver_email && rec.driver_email === user.email;
      const broadcast = !rec.driver_email && rec.type === "info";
      if (!targeted && !broadcast) return;
      seen.current.add(rec.id);
      toast({
        title: rec.title || (targeted ? "Message from dispatch" : "Broadcast"),
        description: rec.message,
      });
    });
    return unsub;
  }, [user?.email]);

  return null;
}