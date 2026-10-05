import React, { useEffect, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadSupportNumber, saveSupportNumber, whatsappLink } from "@/lib/appSupport";

// Admin -> Settings: the WhatsApp number passengers, drivers and admins use
// to report app problems. Empty hides the "Report an app problem" links.
export default function SupportNumberSetting() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadSupportNumber({ fresh: true }).then((n) => { setValue(n); setSaved(n); }); }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setStatus("");
    try {
      const n = await saveSupportNumber(value);
      setValue(n); setSaved(n);
      setStatus(n ? "Saved. The Report an app problem links now open this WhatsApp number." : "Removed. The Report an app problem links are hidden.");
    } catch (err) {
      setStatus(err?.response?.data?.error || "Couldn't save. Check the number and your connection.");
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="tt-support-number">
      <h2 id="tt-support-number" className="flex items-center gap-2 text-title-sm font-bold">
        <MessageSquareWarning className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> App support WhatsApp
      </h2>
      <p className="mt-1 text-body-sm text-muted-foreground">Passengers, drivers and admins tap "Report an app problem" to message this number. Include the country code, e.g. 1 473 555 1234.</p>
      <form onSubmit={save} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="tt-support-wa" className="sr-only">Support WhatsApp number</label>
        <Input id="tt-support-wa" inputMode="tel" autoComplete="off" placeholder="14735551234" value={value} onChange={(e) => setValue(e.target.value)} className="sm:flex-1" />
        <Button type="submit" disabled={busy || value.replace(/[\s()+-]/g, "") === saved}>{busy ? "Saving…" : "Save"}</Button>
      </form>
      {status && <p role="status" className="mt-2 text-body-sm">{status}</p>}
      {saved && <a className="mt-2 inline-block text-body-sm font-semibold underline underline-offset-4" href={whatsappLink(saved, "test")} target="_blank" rel="noopener noreferrer">Test the link</a>}
    </section>
  );
}
