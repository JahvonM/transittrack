import React, { useEffect, useState } from "react";
import { confirmAction } from "@/components/ConfirmHost";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import PullToRefresh from "@/components/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Users, MessageCircle, Plus, Pencil, Trash2, Nfc, Search } from "lucide-react";
import { EmptyState, PageActions, Segmented, StatusChip } from "@/components/admin/kit";
import ContactFormDialog from "@/components/directory/ContactFormDialog";
import { useAuth } from "@/lib/AuthContext";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";

// "staff" in the data = people from client companies who ride the buses.
const TYPE_LABEL = { all: "All", staff: "Company passengers", passenger: "Other passengers" };

export default function StaffDirectory() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    base44.entities.Contact.list("-updated_date", 200).then((c) => {
      setContacts(c);
      setLoading(false);
    }).catch(() => { setLoading(false); loadFailed(); });
  };

  useEffect(() => {
    load();
    // Apply realtime updates incrementally (mirrors Notifications.jsx) instead
    // of re-fetching the whole list on every single event.
    const unsub = base44.entities.Contact.subscribe((event) => {
      if (event.type === "delete") {
        setContacts((prev) => prev.filter((c) => c.id !== event.id));
        return;
      }
      if (!event.data) return;
      setContacts((prev) => {
        const idx = prev.findIndex((c) => c.id === event.data.id);
        return idx === -1 ? [event.data, ...prev] : prev.map((c) => (c.id === event.data.id ? event.data : c));
      });
    });
    return unsub;
  }, []);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    setDialogOpen(true);
  };

  const save = async (data) => {
    const payload = {
      ...data,
      company_id: data.company_id || user?.company_id,
      company_name: data.company_name || user?.company_name,
    };
    if (editing) await base44.entities.Contact.update(editing.id, payload);
    else await base44.entities.Contact.create(payload);
    setDialogOpen(false);
    load();
  };

  const remove = async (c) => {
    if (!(await confirmAction({ title: `Delete ${c.name}?`, description: "This contact will be removed from the directory." }))) return;
    await base44.entities.Contact.delete(c.id);
    load();
  };

  const waLink = (phone) => {
    const d = (phone || "").replace(/\D/g, "");
    return d ? `https://wa.me/${d}` : null;
  };

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = (filter === "all" ? contacts : contacts.filter((c) => c.type === filter))
    .filter((c) => !q || [c.name, c.phone, c.email, c.nfc_card_tag, c.pickup_name, c.dropoff_name, c.company_name].some((x) => String(x || "").toLowerCase().includes(q)));
  const place = (name, lat, lng) => name || (lat != null ? `${lat?.toFixed(4)}, ${lng?.toFixed(4)}` : "");

  return (
    <AppLayout title="Passenger directory">
      <PullToRefresh onRefresh={load}>
      <PageActions>
        <Button onClick={openAdd} size="sm">
          <Plus className="h-4 w-4" /> Add passenger
        </Button>
      </PageActions>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search passengers</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone, card or stop"
            className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <Segmented label="Passenger type" value={filter} onChange={setFilter} options={["all", "staff", "passenger"].map((t) => ({
          value: t, label: TYPE_LABEL[t], count: t === "all" ? contacts.length : contacts.filter((c) => c.type === t).length,
        }))} />
      </div>

      {loading ? (
        <BusLoader className="py-8" />
      ) : contacts.length === 0 ? (
        <EmptyState icon={Users} title="No passengers yet" action={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4" /> Add passenger</Button>}>
          Add the people who ride your buses so drivers and kiosks know them.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No passengers match">Try another search or type.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-4 border-b border-border px-4 py-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground lg:grid" aria-hidden="true">
            <span>Passenger</span><span>Contact</span><span>Pickup and drop-off</span><span className="w-[136px] text-right">Actions</span>
          </div>
          <ul className="divide-y divide-border">
            {filtered.map((c) => {
              const wa = waLink(c.phone);
              const pickup = place(c.pickup_name, c.pickup_lat, c.pickup_lng);
              const dropoff = place(c.dropoff_name, c.dropoff_lat, c.dropoff_lng);
              const initials = (c.name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
              return (
                <li key={c.id} className="grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-body-sm font-bold" aria-hidden="true">{initials}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <StatusChip tone={c.type === "staff" ? "info" : "neutral"} dot={false}>{TYPE_LABEL[c.type] || c.type}</StatusChip>
                        {c.nfc_card_tag && <StatusChip tone="neutral" dot={false}><Nfc className="h-3.5 w-3.5" aria-hidden="true" /> Card</StatusChip>}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 text-body-sm">
                    {c.phone && <p className="truncate">{c.phone}</p>}
                    {c.email && <p className="truncate text-muted-foreground">{c.email}</p>}
                    {!c.phone && !c.email && <p className="text-muted-foreground">No contact details</p>}
                  </div>
                  <div className="min-w-0 text-body-sm">
                    <p className="truncate"><span className="text-muted-foreground">Pickup </span>{pickup || "Not set"}</p>
                    <p className="truncate"><span className="text-muted-foreground">Drop-off </span>{dropoff || "Not set"}</p>
                  </div>
                  <div className="flex items-center gap-1 lg:w-[136px] lg:justify-end">
                    {wa && (
                      <Button asChild variant="ghost" size="icon" title="WhatsApp">
                        <a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${c.name}`}><MessageCircle className="h-4 w-4" /></a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`} title="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(c)} aria-label={`Delete ${c.name}`} title="Delete" className="text-danger hover:text-danger"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ContactFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={save}
        contact={editing}
      />
      </PullToRefresh>
    </AppLayout>
  );
}