import React, { useEffect, useState } from "react";
import { Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NO_BUSINESS, cancellationRule, loadBusinessDetails, saveBusinessDetails } from "@/lib/appSupport";
import { errorData } from "@/lib/requestError";

// Admin -> Settings: the contact details and free-cancellation rule shown on
// the Terms page. Anything left empty simply isn't shown there.
const toForm = (d) => ({
  contact_email: d.contact_email || "", contact_phone: d.contact_phone || "", business_address: d.business_address || "",
  cancel_free_hours: Number.isInteger(d.cancel_free_hours) ? String(d.cancel_free_hours) : "", cancel_late_charge: d.cancel_late_charge || "",
});

export default function BusinessDetailsSetting() {
  const [form, setForm] = useState(toForm(NO_BUSINESS));
  const [saved, setSaved] = useState(toForm(NO_BUSINESS));
  const [status, setStatus] = useState({ text: "", ok: true });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    loadBusinessDetails({ fresh: true }).then((d) => { if (live) { setForm(toForm(d)); setSaved(toForm(d)); } });
    return () => { live = false; };
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const changed = JSON.stringify(form) !== JSON.stringify(saved);
  const hours = form.cancel_free_hours.trim() === "" ? null : Number(form.cancel_free_hours);
  const rule = cancellationRule({ cancel_free_hours: Number.isInteger(hours) ? hours : null, cancel_late_charge: form.cancel_late_charge.trim() });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setStatus({ text: "", ok: true });
    try {
      const d = await saveBusinessDetails({ ...form, cancel_free_hours: form.cancel_free_hours.trim() });
      setForm(toForm(d)); setSaved(toForm(d));
      setStatus({ text: "Saved. The Terms page shows these now.", ok: true });
    } catch (err) {
      setStatus({ text: errorData(err).error || "Couldn't save. Check the details and your connection.", ok: false });
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="tt-business-details">
      <h2 id="tt-business-details" className="flex items-center gap-2 text-title-sm font-bold">
        <Building className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> Business details
      </h2>
      <p className="mt-1 text-body-sm text-muted-foreground">Shown to customers on the Terms page. Leave anything empty that you don't want to show yet.</p>
      <form onSubmit={save} className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tt-biz-email">Email</Label>
            <Input id="tt-biz-email" type="email" autoComplete="off" placeholder="bookings@mcsweenstransport.com" value={form.contact_email} onChange={set("contact_email")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tt-biz-phone">Phone</Label>
            <Input id="tt-biz-phone" type="tel" autoComplete="off" placeholder="+1 473 555 1234" value={form.contact_phone} onChange={set("contact_phone")} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tt-biz-address">Address</Label>
          <Input id="tt-biz-address" autoComplete="off" maxLength={200} placeholder="Street, town, Grenada" value={form.business_address} onChange={set("business_address")} />
        </div>
        <fieldset className="space-y-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-body-sm font-semibold">Cancelling a ride</legend>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <div className="space-y-1">
              <Label htmlFor="tt-biz-hours">Free until (hours before)</Label>
              <Input id="tt-biz-hours" inputMode="numeric" placeholder="24" value={form.cancel_free_hours} onChange={set("cancel_free_hours")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tt-biz-charge">After that, the charge is</Label>
              <Input id="tt-biz-charge" maxLength={120} placeholder="the full price" value={form.cancel_late_charge} onChange={set("cancel_late_charge")} />
            </div>
          </div>
          <p className="text-body-sm text-muted-foreground">{rule ? `The Terms will say: "${rule}"` : "Empty: the Terms just say to cancel as early as possible."}</p>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !changed}>{busy ? "Saving…" : "Save business details"}</Button>
          <a className="text-body-sm font-semibold underline underline-offset-4" href="/terms" target="_blank" rel="noopener noreferrer">See the Terms page</a>
        </div>
        {status.text && <p role="status" className={`text-body-sm ${status.ok ? "" : "text-danger"}`}>{status.text}</p>}
      </form>
    </section>
  );
}
