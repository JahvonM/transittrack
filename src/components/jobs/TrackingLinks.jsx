import React, { useEffect, useState } from "react";
import { Link2, Mail } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { errorData } from "@/lib/requestError";

// Private tracking links for one open job that has a bus. Dispatch can copy a
// link to send by WhatsApp, or, for a ride booked on the website, email it to
// the person who booked. Either way a new link ends the earlier ones, and a
// link stops working if the bus changes.
export default function TrackingLinks({ job }) {
  const { toast } = useToast();
  const [booking, setBooking] = useState(null);
  const [busy, setBusy] = useState("");
  const [link, setLink] = useState("");

  useEffect(() => {
    setLink("");
    setBooking(null);
    if (!job?.id) return undefined;
    let live = true;
    base44.entities.BookingRequest.filter({ trip_id: job.id }, "-created_date", 1)
      .then((rows) => { if (live) setBooking(rows?.[0] || null); })
      .catch(() => {});
    return () => { live = false; };
  }, [job?.id, job?.vehicle_id]);

  if (!job?.vehicle_id || ["completed", "cancelled"].includes(job.status)) return null;

  const copyLink = async () => {
    setBusy("copy");
    try {
      const res = await base44.functions.invoke("visitorTracking", { action: "issue", trip_id: job.id });
      setLink(res.data.url);
      try { await navigator.clipboard.writeText(res.data.url); toast({ title: "Tracking link copied" }); }
      catch { toast({ title: "Tracking link ready", description: "Copy it from the box below." }); }
    } catch (e) {
      toast({ title: "Couldn't make a tracking link", description: errorData(e).error || "Try again in a minute.", variant: "destructive" });
    } finally { setBusy(""); }
  };

  const emailLink = async () => {
    setBusy("email");
    try {
      const res = await base44.functions.invoke("bookingRequest", { action: "send_tracking", trip_id: job.id });
      setLink("");
      toast({ title: "Tracking link emailed", description: `Sent to ${res.data?.to || booking.email}.` });
    } catch (e) {
      toast({ title: "Couldn't email the tracking link", description: errorData(e).error || "Try again in a minute.", variant: "destructive" });
    } finally { setBusy(""); }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-body-sm font-semibold">Tracking for the guest</p>
      <div className="flex flex-wrap gap-2">
        {booking?.email && (
          <Button size="sm" onClick={emailLink} disabled={!!busy}>
            <Mail className="h-4 w-4" /> {busy === "email" ? "Sending…" : `Email link to ${booking.email}`}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={copyLink} disabled={!!busy}>
          <Link2 className="h-4 w-4" /> {busy === "copy" ? "Making link…" : "Copy tracking link"}
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        The link shows only this bus, until a day after the ride. A new link ends the old one, and changing the bus ends it too, so send a new one after a change.
      </p>
      {link && <Input readOnly aria-label="Private tracking link" value={link} onFocus={(e) => e.target.select()} />}
    </div>
  );
}
