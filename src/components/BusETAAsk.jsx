import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Inline "Ask AI how far away is this bus" control.
 * Calls the busAssistant backend function (which uses InvokeLLM) with the
 * vehicle + the user's current location, then displays the AI's ETA answer.
 */
export default function BusETAAsk({ vehicle, userLocation }) {
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    setLoading(true);
    setAnswer("");
    try {
      const question = `How far away is the bus "${vehicle.name}" (plate ${vehicle.plate_number || "unknown"}, type ${vehicle.type}) from my current location, and roughly how long will it take to arrive? Give a short, friendly answer.`;
      const res = await base44.functions.invoke("busAssistant", {
        question,
        company_id: vehicle.company_id,
        user_lat: userLocation?.lat,
        user_lng: userLocation?.lng,
      });
      setAnswer(res?.data?.answer || "Sorry, I couldn't work that out right now.");
    } catch (e) {
      setAnswer("Sorry, I couldn't work that out right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 space-y-1.5 w-52">
      <Button size="sm" variant="outline" onClick={ask} disabled={loading} className="w-full">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {loading ? "Working it out…" : "Ask AI how far away"}
      </Button>
      {answer && <p className="text-xs text-muted-foreground leading-snug">{answer}</p>}
    </div>
  );
}