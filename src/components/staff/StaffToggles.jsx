import React from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { waLink } from "@/lib/mapbox";
import { BellOff, Clock, MessageCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StaffToggles({ companyPhone }) {
  const { user, checkUserAuth } = useAuth();

  const toggle = async (field) => {
    const newVal = !user[field];
    await base44.auth.updateMe({ [field]: newVal });
    await checkUserAuth();
  };

  const linkWhatsapp = async () => {
    await base44.auth.updateMe({ whatsapp_linked: true });
    await checkUserAuth();
  };

  const waOptIn = waLink(
    companyPhone,
    `Hi, this is ${user?.full_name || user?.email}. I'd like to receive staff bus updates via WhatsApp.`
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pickup preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          variant={user?.skip_pickup_today ? "default" : "outline"}
          className="w-full justify-start"
          onClick={() => toggle("skip_pickup_today")}
        >
          <BellOff className="w-4 h-4 mr-2" />
          {user?.skip_pickup_today ? "Skipping pickup today (tap to resume)" : "Skip pickup today"}
        </Button>
        <Button
          variant={user?.late_snooze_active ? "default" : "outline"}
          className="w-full justify-start"
          onClick={() => toggle("late_snooze_active")}
        >
          <Clock className="w-4 h-4 mr-2" />
          {user?.late_snooze_active ? "Running late — driver notified (tap to clear)" : "I'm running late"}
        </Button>
        {user?.whatsapp_linked ? (
          <div className="flex items-center gap-2 text-sm text-green-400 pt-1">
            <CheckCircle2 className="w-4 h-4" /> WhatsApp linked
          </div>
        ) : (
          <Button asChild variant="outline" className="w-full justify-start">
            <a href={waOptIn} target="_blank" rel="noopener noreferrer" onClick={linkWhatsapp}>
              <MessageCircle className="w-4 h-4 mr-2 text-green-400" /> Link my WhatsApp
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}