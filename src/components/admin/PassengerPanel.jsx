import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/admin/kit";
import { Bus, ClipboardList, IdCard, LogIn, LogOut, MapPin, Nfc } from "lucide-react";

const enc = encodeURIComponent;
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");

function Section({ icon: Icon, title, children, action }) {
  return (
    <section className="border-t border-border py-4" aria-label={title}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="flex-1 text-body-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// One passenger, from the Directory: their card, bus and pickup, and their
// last few boardings, with one tap to the tab that changes each. Everything
// here is read from what the Directory already loaded, except the boardings.
export default function PassengerPanel({ person, open, onOpenChange, place, canIssueCards, onEditPickup }) {
  const [boardings, setBoardings] = useState(null);
  const key = person?.key || "";
  useEffect(() => {
    if (!open || !key) return undefined;
    let live = true;
    setBoardings(null);
    base44.entities.StaffCheckIn.filter({ person_key: key }, "-created_date", 20)
      .then((rows) => { if (live) setBoardings((rows || []).filter((r) => r.person_key === key).slice(0, 5)); })
      .catch(() => { if (live) setBoardings("error"); });
    return () => { live = false; };
  }, [open, key]);
  if (!person) return null;
  const pickup = place(person.pickup_name, person.pickup_lat, person.pickup_lng);
  const hasCard = person.status === "Card Issued";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pb-3 text-left">
          <SheetTitle>{person.name}</SheetTitle>
          <SheetDescription>{[person.company_name || "No company", person.phone, person.email].filter(Boolean).join(" · ")}</SheetDescription>
        </SheetHeader>

        <Section icon={IdCard} title="Card" action={canIssueCards && (
          <Button asChild size="sm" variant="outline">
            <Link to={`/admin/cards?person=${enc(key)}`}><Nfc className="h-4 w-4" /> {hasCard ? "Manage card" : "Issue card"}</Link>
          </Button>
        )}>
          <StatusChip tone={hasCard ? "success" : person.status && person.status !== "Unassigned" ? "warning" : "neutral"} dot={false}>
            {hasCard ? "Card issued" : person.status && person.status !== "Unassigned" ? person.status + " card" : "No card yet"}
          </StatusChip>
          {canIssueCards && <p className="mt-2 text-caption text-muted-foreground"><Link to={`/admin/card-designs?person=${enc(key)}`} className="underline underline-offset-4 hover:text-foreground">Design their printed card</Link></p>}
        </Section>

        <Section icon={Bus} title="Bus and pickup" action={onEditPickup && (
          <Button size="sm" variant="outline" onClick={() => onEditPickup(person)}><MapPin className="h-4 w-4" /> {pickup ? "Edit pickup" : "Add pickup"}</Button>
        )}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body-sm">
            <dt className="text-muted-foreground">Bus</dt><dd>{person.assigned_vehicle || "No bus yet"}</dd>
            <dt className="text-muted-foreground">Pickup</dt><dd>{pickup || "Not set"}</dd>
          </dl>
        </Section>

        <Section icon={ClipboardList} title="Recent boardings" action={canIssueCards && (
          <Button asChild size="sm" variant="ghost">
            <Link to={`/admin/checkins?person=${enc(key)}`}>See all</Link>
          </Button>
        )}>
          {boardings === null ? <p role="status" className="text-body-sm text-muted-foreground">Loading…</p>
            : boardings === "error" ? <p className="text-body-sm text-muted-foreground">Couldn't load their boardings. Try the Sign-in log.</p>
              : !boardings.length ? <p className="text-body-sm text-muted-foreground">No boardings recorded yet.</p>
                : (
                  <ul className="space-y-2" aria-label={`${person.name}'s recent boardings`}>
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
      </SheetContent>
    </Sheet>
  );
}
