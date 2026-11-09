import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusChip } from "@/components/admin/kit";
import { Bus, ClipboardList, IdCard, ImageIcon, LogIn, LogOut, MapPin, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { cardArtwork, DEFAULT_CARD_DESIGN } from "@/lib/cardArtwork";
import { BusLink, CardProgrammer, CardStateChip, CardStopButtons, initials, useCardStops } from "@/components/admin/cardIssuing";

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");
const waLink = (phone) => { const d = (phone || "").replace(/\D/g, ""); return d ? `https://wa.me/${d}` : null; };
export const TYPE_LABEL = { staff: "Company passenger", passenger: "Other passenger", driver: "Driver", mechanic: "Mechanic", other: "Card holder" };
export const place = (name, lat, lng) => name || (lat != null ? `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}` : "");

function Section({ icon: Icon, title, children, action }) {
  return (
    <section className="border-t border-border py-4" aria-label={title}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="flex-1 text-body font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// The printed card as it would come out for this person, from the design
// saved on this computer (Card design).
function PrintedCard({ person, onDesign }) {
  const { user } = useAuth();
  const svg = useMemo(() => {
    let design = DEFAULT_CARD_DESIGN;
    try { const saved = JSON.parse(localStorage.getItem("tt-card-artwork:" + (user?.id || "anonymous")) || "null"); if (saved) design = { ...DEFAULT_CARD_DESIGN, ...saved }; } catch { /* default */ }
    return cardArtwork(design, person, "front", "");
  }, [person, user?.id]);
  return (
    <Section icon={ImageIcon} title="Printed card" action={<Button size="sm" variant="outline" onClick={() => onDesign(person)}>Design and print</Button>}>
      <div className="max-w-[260px] overflow-hidden rounded-lg shadow [&_svg]:h-auto [&_svg]:w-full" data-testid="person-card-preview" dangerouslySetInnerHTML={{ __html: svg }} />
    </Section>
  );
}

// One passenger (or other card holder), everything about them in one place:
// who they are, their company, bus and pickup, their card, their printed
// card and their recent sign-ins.
export default function PersonPanel({
  person, open, onOpenChange, reader, vehicles, tablets, cards, companies, canEdit,
  onChanged, onAssignCompany, onEditPickup, onEdit, onDelete, onDesign, onOpenLog, busy,
}) {
  const [boardings, setBoardings] = useState(null);
  const key = person?.key || "";
  const passenger = person?.type === "staff";
  useEffect(() => {
    if (!open || !key || !passenger) return undefined;
    let live = true;
    setBoardings(null);
    base44.entities.StaffCheckIn.filter({ person_key: key }, "-created_date", 20)
      .then((rows) => { if (live) setBoardings((rows || []).filter((r) => r.person_key === key).slice(0, 5)); })
      .catch(() => { if (live) setBoardings("error"); });
    return () => { live = false; };
  }, [open, key, passenger]);
  const stops = useCardStops(() => onChanged?.(key));
  if (!person) return null;
  const pickup = place(person.pickup_name, person.pickup_lat, person.pickup_lng);
  const dropoff = place(person.dropoff_name, person.dropoff_lat, person.dropoff_lng);
  const wa = waLink(person.phone);
  // Their cards that can still change: the one in use, or one switched off for now.
  const theirCards = (cards || []).filter((c) => `${c.holder_source}:${c.holder_id}` === key && ["active", "suspended"].includes(c.status));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pb-3 text-left">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-secondary text-body font-bold" aria-hidden="true">{initials(person.name)}</span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate">{person.name}</SheetTitle>
              <SheetDescription>{[person.phone, person.email].filter(Boolean).join(" · ") || "No contact details"}</SheetDescription>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <StatusChip tone={person.kind === "staff" ? "info" : "neutral"} dot={false}>{TYPE_LABEL[passenger ? person.kind : person.type] || person.role}</StatusChip>
                {person.registered && <StatusChip tone="neutral" dot={false}>Email account</StatusChip>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {wa && <Button asChild size="sm" variant="outline"><a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${person.name}`}><MessageCircle className="h-4 w-4" /> WhatsApp</a></Button>}
            {canEdit && person.source === "contact" && <Button size="sm" variant="outline" onClick={() => onEdit(person)} aria-label={`Edit ${person.name}`}><Pencil className="h-4 w-4" /> Edit</Button>}
            {canEdit && person.source === "contact" && <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => onDelete(person)} aria-label={`Delete ${person.name}`}><Trash2 className="h-4 w-4" /> Delete</Button>}
          </div>
        </SheetHeader>

        {passenger && (
          <Section icon={Bus} title="Company, bus and pickup">
            <div className="space-y-3">
              {canEdit ? (
                <div>
                  <span className="text-xs text-muted-foreground">Company</span>
                  <Select value={person.company_id || "__unassigned__"} onValueChange={(v) => onAssignCompany(person, v)} disabled={busy}>
                    <SelectTrigger className="mt-1 h-9" aria-label={`Company for ${person.name}`}><SelectValue placeholder="Assign company" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__" disabled>Assign company</SelectItem>
                      {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!person.company_id && <p className="mt-1 text-caption text-warning">Company membership needed before card issuing</p>}
                </div>
              ) : <p className="text-body-sm">{person.company_name || "No company assigned"}</p>}
              <BusLink person={person} vehicles={vehicles} tablets={tablets} onChanged={(k) => onChanged?.(k || key)} />
              <div className="flex flex-wrap items-start justify-between gap-2">
                <dl className="grid min-w-0 grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body-sm">
                  <dt className="text-muted-foreground">Pickup</dt><dd className="truncate">{pickup || "Not set"}</dd>
                  <dt className="text-muted-foreground">Destination</dt><dd className="truncate">{dropoff || "Company address not set"}</dd>
                </dl>
                <Button size="sm" variant="outline" onClick={() => onEditPickup(person)} aria-label={`Set pickup for ${person.name}`}><MapPin className="h-4 w-4" /> {pickup ? "Edit pickup" : "Add pickup"}</Button>
              </div>
            </div>
          </Section>
        )}

        {!passenger && (
          <Section icon={Bus} title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body-sm">
              <dt className="text-muted-foreground">Company</dt><dd>{person.company_name || "—"}</dd>
              <dt className="text-muted-foreground">Bus</dt><dd>{person.assigned_vehicle || "—"}</dd>
            </dl>
          </Section>
        )}

        {canEdit && (
          <Section icon={IdCard} title="Card">
            {theirCards.length > 0 && (
              <ul className="mb-3 space-y-2" aria-label={`${person.name}'s cards`}>
                {theirCards.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-body-sm">
                    <span className="min-w-0 flex-1"><CardStateChip card={c} /></span>
                    <CardStopButtons card={c} {...stops} />
                  </li>
                ))}
              </ul>
            )}
            {passenger && !person.company_id
              ? <p className="text-body-sm text-muted-foreground">Assign their company first, then program their card here.</p>
              : <CardProgrammer person={person} reader={reader} onIssued={(k) => onChanged?.(k)} />}
          </Section>
        )}

        {canEdit && <PrintedCard person={person} onDesign={onDesign} />}

        {passenger && (
          <Section icon={ClipboardList} title="Recent sign-ins" action={<Button size="sm" variant="ghost" onClick={() => onOpenLog(person)}>See all</Button>}>
            {boardings === null ? <p role="status" className="text-body-sm text-muted-foreground">Loading…</p>
              : boardings === "error" ? <p className="text-body-sm text-muted-foreground">Couldn't load their sign-ins. Try the full sign-in log.</p>
                : !boardings.length ? <p className="text-body-sm text-muted-foreground">No sign-ins recorded yet.</p>
                  : (
                    <ul className="space-y-2" aria-label={`${person.name}'s recent sign-ins`}>
                      {boardings.map((r) => (
                        <li key={r.id} className="flex items-center gap-2 text-body-sm">
                          {r.status === "boarded" ? <LogIn className="h-4 w-4 text-success" aria-hidden="true" /> : <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                          <span className="flex-1 truncate">{r.status === "boarded" ? "Got on" : "Got off"} {r.vehicle_name || ""}</span>
                          <span className="shrink-0 text-caption text-muted-foreground">{when(r.boarded_at || r.created_date)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
          </Section>
        )}
      </SheetContent>
    </Sheet>
  );
}
